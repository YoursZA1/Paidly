/**
 * Invoice Send Service
 * Handles sending invoices to clients via email and notifications
 */

import { Invoice, Quote, Client, BankingDetail, DocumentSend, MessageLog, User } from '@/api/entities';
import { supabase } from '@/lib/supabaseClient';
import { generateQuotePDF } from '@/components/pdf/generateQuotePDF';
import { generateQuoteEmailHtml } from '@/utils/quoteEmailHtml';
import { createPageUrl } from '@/utils';
import { retryOnAbort, isAbortError, retryOnTransientFetch } from '@/utils/retryOnAbort';
import { snapshotDocumentBrandForPersist } from '@/utils/documentBrandColors';

/**
 * Base URL for trackable links and email pixel (client: window.origin; server: pass explicitly).
 * @param {string} [baseUrl] - Optional. When omitted in browser uses window.location.origin.
 * @returns {string}
 */
export const getTrackableBaseUrl = (baseUrl) => {
  if (baseUrl) return baseUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};

/**
 * URL for the email open-tracking pixel. Embed in HTML as:
 * <img src="{url}" width="1" height="1" alt="" />
 * When the email client loads the image, GET /api/email-track/:token runs and logs the open in message_logs.
 * @param {string} trackingToken - Same token used for the invoice view link (from createTrackableInvoiceLink).
 * @param {string} [baseUrl] - App base URL (e.g. https://yourapp.com). Omit in browser to use current origin.
 * @returns {string} Full URL (query form works on Vercel static + serverless)
 */
export const getEmailOpenTrackingPixelUrl = (trackingToken, baseUrl) => {
  const base = getTrackableBaseUrl(baseUrl);
  if (!base || !trackingToken) return '';
  return `${base}/api/email-track?token=${encodeURIComponent(trackingToken)}`;
};

/**
 * Wrap a destination URL so the first click is logged (clicked_at) before redirect.
 * @param {string} trackingToken - message_logs.tracking_token
 * @param {string} destinationUrl - Full HTTPS URL (e.g. trackable view URL)
 * @param {string} [baseUrl] - Site origin
 */
export const getTrackedLinkUrl = (trackingToken, destinationUrl, baseUrl) => {
  const base = getTrackableBaseUrl(baseUrl);
  if (!base || !trackingToken || !destinationUrl) return destinationUrl;
  return `${base}/api/track-link?token=${encodeURIComponent(trackingToken)}&u=${encodeURIComponent(destinationUrl)}`;
};

/**
 * Log the send to message_logs and return a trackable link (and token for optional pixel).
 * Every send action (email or WhatsApp) should call this so the message is logged.
 * Inserts: document_type, document_id, client_id, channel, recipient, sent_at, tracking_token
 * @param {object} invoice - { id, public_share_token, client_id }
 * @param {string} channel - 'email' | 'whatsapp'
 * @param {string} recipient - Email address or phone (for message_logs.recipient)
 * @returns {Promise<{ url: string, trackingToken: string }>} url = view link; trackingToken = for email pixel
 */
export const createTrackableInvoiceLink = async (invoice, channel, recipient) => {
  const shareToken = invoice?.public_share_token;
  if (!shareToken) {
    throw new Error('Invoice has no share token. Generate a share link first.');
  }
  const token = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  await retryOnTransientFetch(() =>
    MessageLog.create({
      document_type: 'invoice',
      document_id: invoice.id,
      client_id: invoice.client_id || null,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
      recipient: recipient || null,
      sent_at: sentAt,
      tracking_token: token,
    })
  );
  const origin = getTrackableBaseUrl();
  const url = `${origin}/view/${shareToken}?token=${token}`;
  return { url, trackingToken: token };
};

/**
 * Same as createTrackableInvoiceLink for quotes (public share token + message_logs row).
 */
export const createTrackableQuoteLink = async (quote, channel, recipient) => {
  const shareToken = quote?.public_share_token;
  if (!shareToken) {
    throw new Error('Quote has no share token. Generate a share link first.');
  }
  const token = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  await retryOnTransientFetch(() =>
    MessageLog.create({
      document_type: 'quote',
      document_id: quote.id,
      client_id: quote.client_id || null,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
      recipient: recipient || null,
      sent_at: sentAt,
      tracking_token: token,
    })
  );
  const origin = getTrackableBaseUrl();
  const basePath = createPageUrl('PublicQuote');
  const url = `${origin}${basePath}?token=${encodeURIComponent(shareToken)}&tracking=${encodeURIComponent(token)}`;
  return { url, trackingToken: token };
};

/**
 * Record a document send for Messages page tracking (Document, Client, Channel, Status, Opened, Viewed Time, Paid, Payment Time).
 * @param {string} documentType - 'invoice' | 'quote'
 * @param {string} documentId - UUID
 * @param {string} clientId - UUID (optional for quotes)
 * @param {string} channel - 'email' | 'whatsapp'
 */
export const recordDocumentSend = async (documentType, documentId, clientId, channel) => {
  try {
    await DocumentSend.create({
      document_type: documentType,
      document_id: documentId,
      client_id: clientId || null,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Failed to record document send:', e);
  }
};

async function ensureQuotePublicShareToken(quote) {
  if (quote?.public_share_token) return quote;
  const token = crypto.randomUUID();
  await retryOnAbort(() => Quote.update(quote.id, { public_share_token: token }));
  return { ...quote, public_share_token: token };
}

function pdfBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read PDF blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Send quote PDF to the client via the same `send-invoice-email` edge function as QuoteActions.
 * Builds branded HTML (with trackable CTA + pixel) when `options.html` is omitted.
 * Records a document send on success. Does not change quote status — caller persists that.
 *
 * @param {object} quote - Quote row including `items`
 * @param {object} client - Client row with `email`
 * @param {{ html?: string }} [options] - Pass `html` when using QuoteEmailPreviewModal’s final HTML
 * @returns {Promise<{ success: boolean, sentAt: string }>}
 */
export async function sendQuotePdfEmailToClient(quote, client, options = {}) {
  const { html: htmlOverride } = options || {};
  if (!client?.email?.trim()) {
    throw new Error('Client has no email address.');
  }

  const userData = await retryOnAbort(() => User.me());
  let html = htmlOverride;
  let quoteForSend = quote;

  if (!html) {
    quoteForSend = await ensureQuotePublicShareToken(quote);
    const recipient = client.email.trim();
    const { url, trackingToken } = await createTrackableQuoteLink(quoteForSend, 'email', recipient);
    const pixelUrl = trackingToken ? getEmailOpenTrackingPixelUrl(trackingToken) : '';
    const ctaHref = trackingToken && url ? getTrackedLinkUrl(trackingToken, url) : url;
    html = generateQuoteEmailHtml(quoteForSend, client, userData, ctaHref, pixelUrl);
  }

  const quoteForPdf = {
    ...quoteForSend,
    items: Array.isArray(quoteForSend.items) ? quoteForSend.items : [],
  };
  const bid = quoteForPdf.banking_detail_id && String(quoteForPdf.banking_detail_id).trim();
  let bankingRow = null;
  if (bid) {
    try {
      bankingRow = await BankingDetail.get(bid);
    } catch {
      bankingRow = null;
    }
  }

  const pdfBlob = await generateQuotePDF({
    quote: quoteForPdf,
    client,
    user: userData,
    bankingDetail: bankingRow,
  });
  const pdfBase64 = await pdfBlobToBase64(pdfBlob);

  const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.com/gi, '.supabase.co');
  if (!supabaseUrl) throw new Error('Supabase URL is not configured.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('You must be logged in to send emails.');

  const subject = `Quote #${quoteForSend.quote_number} from ${quoteForSend.owner_company_name || userData?.company_name || 'Us'}`;
  const filename = `quote-${quoteForSend.quote_number || quoteForSend.id || 'quote'}.pdf`;

  const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      pdfBase64,
      email: client.email.trim(),
      subject,
      html,
      filename,
    }),
  });
  if (!sendRes.ok) {
    let details = '';
    try {
      details = await sendRes.text();
    } catch {
      details = '';
    }
    throw new Error(details || 'Failed to send quote email.');
  }

  await recordDocumentSend('quote', quoteForSend.id, client.id, 'email');

  return { success: true, sentAt: new Date().toISOString() };
}

/**
 * Load quote + client and send PDF email (used by EditQuote after persisting “sent”).
 * @param {string} quoteId
 */
export const sendQuoteToClient = async (quoteId, options = {}) => {
  void options;
  try {
    const quote = await retryOnAbort(() => Quote.get(quoteId));
    if (!quote?.client_id) throw new Error('Quote has no client.');
    const client = await retryOnAbort(() => Client.get(quote.client_id));
    return await sendQuotePdfEmailToClient(quote, client, {});
  } catch (error) {
    console.error('Error sending quote:', error);
    if (isAbortError(error)) {
      throw new Error('Request was interrupted. Please try again.');
    }
    throw error;
  }
};

/**
 * Send invoice to client
 * @param {string} invoiceId - Invoice ID
 * @param {object} options - Send options
 * @returns {Promise} Send result
 */
export const sendInvoiceToClient = async (invoiceId, options = {}) => {
  try {
    // Options are preserved for future API implementation
    // Currently: emailSubject, emailMessage, cc, bcc, sendSMS, sendNotification
    void options;

    const me = await User.me().catch(() => null);
    const brandPatch = me ? snapshotDocumentBrandForPersist(me) : {};

    // Update invoice status to 'sent' (with retry on spurious AbortError)
    await retryOnAbort(() =>
      Invoice.update(invoiceId, {
        status: 'sent',
        sent_date: new Date().toISOString(),
        ...brandPatch,
      })
    );

    // Record send for Messages page (channel = email when sent from app)
    const invoice = await retryOnAbort(() => Invoice.get(invoiceId)).catch(() => null);
    if (invoice?.client_id) {
      recordDocumentSend('invoice', invoiceId, invoice.client_id, 'email');
    }

    // TODO: Implement actual email sending via API
    // await breakApi.post(`/api/invoices/${invoiceId}/send`, {
    //   emailSubject,
    //   emailMessage,
    //   cc,
    //   bcc,
    //   sendSMS,
    //   sendNotification,
    // });

    return {
      success: true,
      sentAt: new Date().toISOString(),
      invoiceId,
    };
  } catch (error) {
    console.error('Error sending invoice:', error);
    if (isAbortError(error)) {
      throw new Error('Request was interrupted. Please try again.');
    }
    throw error;
  }
};

/**
 * Send draft invoice (converts to sent)
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise} Send result
 */
export const sendDraftInvoice = async (invoiceId) => {
  try {
    const invoice = await retryOnAbort(() => Invoice.get(invoiceId));

    if (invoice.status !== 'draft') {
      throw new Error('Invoice is not a draft');
    }

    return await sendInvoiceToClient(invoiceId);
  } catch (error) {
    console.error('Error sending draft invoice:', error);
    if (isAbortError(error)) {
      throw new Error('Request was interrupted. Please try again.');
    }
    throw error;
  }
};

/**
 * Save invoice as draft
 * @param {object} invoiceData - Invoice data
 * @returns {Promise} Created draft invoice
 */
export const saveInvoiceAsDraft = async (invoiceData) => {
  try {
    const draftInvoice = await Invoice.create({
      ...invoiceData,
      status: 'draft',
      draft_created_date: new Date().toISOString(),
    });

    return draftInvoice;
  } catch (error) {
    console.error('Error saving invoice as draft:', error);
    throw error;
  }
};

/**
 * Update draft invoice
 * @param {string} invoiceId - Invoice ID
 * @param {object} updates - Updated data
 * @returns {Promise} Updated invoice
 */
export const updateDraftInvoice = async (invoiceId, updates) => {
  try {
    const invoice = await Invoice.get(invoiceId);

    if (invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be updated this way');
    }

    const updatedInvoice = await Invoice.update(invoiceId, {
      ...updates,
      status: 'draft',
      last_modified_date: new Date().toISOString(),
    });

    return updatedInvoice;
  } catch (error) {
    console.error('Error updating draft invoice:', error);
    throw error;
  }
};

/**
 * Get all draft invoices
 * @returns {Promise} Array of draft invoices
 */
export const getDraftInvoices = async () => {
  try {
    const invoices = await Invoice.list('-created_date');
    return invoices.filter((invoice) => invoice.status === 'draft');
  } catch (error) {
    console.error('Error fetching draft invoices:', error);
    return [];
  }
};

/**
 * Delete draft invoice
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise} Deletion result
 */
export const deleteDraftInvoice = async (invoiceId) => {
  try {
    const invoice = await Invoice.get(invoiceId);

    if (invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be deleted');
    }

    await Invoice.delete(invoiceId);

    return {
      success: true,
      invoiceId,
    };
  } catch (error) {
    console.error('Error deleting draft invoice:', error);
    throw error;
  }
};

/**
 * Resend invoice to client
 * @param {string} invoiceId - Invoice ID
 * @param {object} options - Send options (reserved for future use)
 * @returns {Promise} Send result
 */
export const resendInvoice = async (invoiceId, options = {}) => {
  // Note: options parameter is preserved for future API implementation
  void options;
  try {
    const invoice = await Invoice.get(invoiceId);

    if (invoice.status === 'draft') {
      throw new Error('Cannot resend a draft invoice. Send it first.');
    }

    // Update last sent date
    await Invoice.update(invoiceId, {
      last_sent_date: new Date().toISOString(),
      resend_count: (invoice.resend_count || 0) + 1,
    });

    // TODO: Implement actual email resending via API
    // await breakApi.post(`/api/invoices/${invoiceId}/resend`, options);

    return {
      success: true,
      resentAt: new Date().toISOString(),
      invoiceId,
    };
  } catch (error) {
    console.error('Error resending invoice:', error);
    throw error;
  }
};

/**
 * Schedule invoice send
 * @param {string} invoiceId - Invoice ID
 * @param {string} scheduledDate - Date to send invoice
 * @returns {Promise} Schedule result
 */
export const scheduleInvoiceSend = async (invoiceId, scheduledDate) => {
  try {
    await Invoice.update(invoiceId, {
      status: 'scheduled',
      scheduled_send_date: scheduledDate,
    });

    return {
      success: true,
      scheduledFor: scheduledDate,
      invoiceId,
    };
  } catch (error) {
    console.error('Error scheduling invoice:', error);
    throw error;
  }
};

export default {
  sendInvoiceToClient,
  sendDraftInvoice,
  saveInvoiceAsDraft,
  updateDraftInvoice,
  getDraftInvoices,
  deleteDraftInvoice,
  resendInvoice,
  scheduleInvoiceSend,
};
