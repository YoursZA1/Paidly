/**
 * Invoice Send Service
 * Handles sending invoices to clients via email and notifications
 */

import { Invoice, Quote, Client, BankingDetail, DocumentSend, MessageLog, User } from '@/api/entities';
import { supabase } from '@/lib/supabaseClient';
import { getStableSession, getStableSessionResult } from '@/core/auth/SessionCoordinator';
import { generateQuotePDF } from '@/components/pdf/generateQuotePDF';
import { generateInvoicePDF } from '@/components/pdf/generateInvoicePDF';
import { generateQuoteEmailHtml } from '@/utils/quoteEmailHtml';
import { generateInvoiceEmailHtml } from '@/utils/invoiceEmailHtml';
import { getPublicApiBase } from '@/api/backendClient';
import { createPageUrl } from '@/utils';
import { retryOnAbort, isAbortError, retryOnTransientFetch } from '@/utils/retryOnAbort';
import { snapshotDocumentBrandForPersist } from '@/utils/documentBrandColors';
import { beginCriticalSessionOperation, endCriticalSessionOperation } from '@/lib/sessionTimeoutControls';
import { isValidEmail } from '@/utils/inputSanitization';

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
 * Build a trackable invoice view URL without writing message_logs.
 * Persist the log only after the email provider accepts the send.
 * @param {object} invoice - { public_share_token }
 * @param {string} [trackingToken]
 * @returns {{ url: string, trackingToken: string }}
 */
export function prepareInvoiceTrackingLink(invoice, trackingToken) {
  const shareToken = invoice?.public_share_token;
  if (!shareToken) {
    throw new Error('Invoice has no share token. Generate a share link first.');
  }
  const token = trackingToken || crypto.randomUUID();
  const origin = getTrackableBaseUrl();
  const url = `${origin}/view/${shareToken}?token=${token}`;
  return { url, trackingToken: token };
}

/**
 * Log a confirmed send (WhatsApp share, or email after provider success).
 * @param {object} invoice
 * @param {string} channel
 * @param {string} recipient
 * @param {string} trackingToken
 * @param {string} [sentAt]
 */
export async function persistInvoiceTrackingLog(invoice, channel, recipient, trackingToken, sentAt) {
  if (!trackingToken) return;
  await retryOnTransientFetch(() =>
    MessageLog.create({
      document_type: 'invoice',
      document_id: invoice.id,
      client_id: invoice.client_id || null,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
      recipient: recipient || null,
      sent_at: sentAt || new Date().toISOString(),
      tracking_token: trackingToken,
    })
  );
}

/**
 * WhatsApp share uses this at confirm time. Email preview must use prepareInvoiceTrackingLink
 * and persist only after provider success.
 * @param {object} invoice - { id, public_share_token, client_id }
 * @param {string} channel - 'email' | 'whatsapp'
 * @param {string} recipient
 * @returns {Promise<{ url: string, trackingToken: string }>}
 */
export const createTrackableInvoiceLink = async (invoice, channel, recipient) => {
  const prepared = prepareInvoiceTrackingLink(invoice);
  await persistInvoiceTrackingLog(invoice, channel, recipient, prepared.trackingToken);
  return prepared;
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

function redactSendErrorDetails(raw) {
  const text = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw);
  return text
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/re_[A-Za-z0-9_]+/g, '[redacted]')
    .slice(0, 400);
}

function userFacingInvoiceSendError(raw, fallback) {
  const s = redactSendErrorDetails(raw);
  if (/no email|missing client email/i.test(s)) return 'Client has no email address.';
  if (/invalid email/i.test(s)) return 'Client email address is invalid.';
  if (/share token/i.test(s)) return 'Public invoice URL could not be generated. Please try again.';
  if (/pdf/i.test(s) && /fail|generat|read/i.test(s)) return 'Invoice PDF generation failed. Please try again.';
  if (/not configured|misconfigured|RESEND/i.test(s)) {
    return 'Email service is unavailable. Please try again later.';
  }
  if (/unauthorized|not signed in|logged in/i.test(s)) {
    return 'You must be logged in to send emails.';
  }
  if (/too large|413/i.test(s)) {
    return 'Invoice PDF is too large to email. Please try again or share a link.';
  }
  if (!s || s.trim().startsWith('{') || s.length > 180) {
    return fallback || 'Invoice could not be sent. Please try again.';
  }
  return s;
}

async function readFetchBody(res) {
  const text = await res.text().catch(() => '');
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { text, json };
}

function assertProviderAccepted(res, body, label) {
  const errorPayload = body.json?.error || body.json?.message || body.text;
  if (!res.ok) {
    throw new Error(userFacingInvoiceSendError(errorPayload, `${label} rejected the request.`));
  }
  if (body.json && body.json.success === false) {
    throw new Error(userFacingInvoiceSendError(errorPayload, `${label} rejected the request.`));
  }
}

function normalizeIdempotencyKey(raw) {
  const key = String(raw || '').trim();
  if (!key) return '';
  return key.slice(0, 256);
}

async function findMessageLogByTrackingToken(token) {
  const trackingToken = String(token || '').trim();
  if (!trackingToken) return null;
  try {
    const { data, error } = await supabase
      .from('message_logs')
      .select('id, document_id')
      .eq('tracking_token', trackingToken)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Canonical invoice email dispatch used by interactive send and the sync queue.
 * Primary: Supabase edge `send-invoice-email` (Resend). Fallback: POST /api/send-invoice.
 * Success requires HTTP 2xx and, when JSON is present, `success !== false`.
 */
export async function dispatchInvoiceEmailViaCanonicalPath({
  pdfBase64,
  email,
  subject,
  html,
  filename,
  invoiceNum,
  fromName,
  clientName,
  amountDue,
  dueDate,
  idempotencyKey,
}) {
  const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseUrl = String(rawSupabaseUrl).replace(/\.supabase\.com/gi, '.supabase.co').trim();
  if (!supabaseUrl) throw new Error('Email service is unavailable. Please try again later.');

  const sessionResult = await getStableSessionResult();
  if (sessionResult?.error) throw sessionResult.error;
  const accessToken =
    sessionResult?.data?.session?.access_token || (await getStableSession())?.access_token;
  if (!accessToken) throw new Error('You must be logged in to send emails.');

  const idempotency = normalizeIdempotencyKey(idempotencyKey);

  let primaryError = null;
  try {
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        pdfBase64,
        email,
        subject,
        html,
        filename,
        ...(idempotency ? { idempotencyKey: idempotency } : {}),
      }),
    });
    const body = await readFetchBody(sendRes);
    assertProviderAccepted(sendRes, body, 'Email service');
    return { channel: 'edge', provider: body.json || { success: true } };
  } catch (edgeErr) {
    primaryError = edgeErr;
  }

  const apiBase = getPublicApiBase() || '';
  const fallbackRes = await fetch(`${apiBase}/api/send-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      base64PDF: pdfBase64,
      clientEmail: email,
      invoiceNum: String(invoiceNum || ''),
      fromName: String(fromName || 'Paidly'),
      clientName: String(clientName || 'there'),
      amountDue: String(amountDue ?? ''),
      dueDate: String(dueDate || ''),
      ...(idempotency ? { idempotencyKey: idempotency } : {}),
    }),
  });
  const fallbackBody = await readFetchBody(fallbackRes);
  try {
    assertProviderAccepted(fallbackRes, fallbackBody, 'Email service');
  } catch (fallbackErr) {
    const primaryMsg = primaryError?.message || 'Email service failed';
    throw new Error(
      userFacingInvoiceSendError(
        `${primaryMsg} | ${fallbackErr.message}`,
        'Invoice could not be sent. Please try again.'
      )
    );
  }
  return { channel: 'api', provider: fallbackBody.json || { success: true } };
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
  beginCriticalSessionOperation();
  try {
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

  const session = await getStableSession();
  const accessToken = session?.access_token;
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
  } finally {
    endCriticalSessionOperation();
  }
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
 * Send invoice PDF to the client via the same edge function + /api/send-invoice fallback
 * as InvoiceActions. Does not mark the invoice sent until the provider/API accepts the email.
 *
 * @param {object} invoice
 * @param {object} client
 * @param {{ html?: string, markSent?: boolean, trackingToken?: string, sendOperationId?: string }} [options]
 */
export async function sendInvoicePdfEmailToClient(invoice, client, options = {}) {
  beginCriticalSessionOperation();
  try {
    const email = String(client?.email || '').trim();
    if (!email) {
      throw new Error('Client has no email address.');
    }
    if (!isValidEmail(email)) {
      throw new Error('Client email address is invalid.');
    }
    if (!invoice?.id) {
      throw new Error('Invoice not found.');
    }

    const userData = await retryOnAbort(() => User.me());
    let invoiceForSend = invoice;
    if (!invoiceForSend.public_share_token) {
      const shareToken = crypto.randomUUID();
      await retryOnAbort(() => Invoice.update(invoiceForSend.id, { public_share_token: shareToken }));
      invoiceForSend = { ...invoiceForSend, public_share_token: shareToken };
    }

    const sendOperationId = String(options.sendOperationId || options.trackingToken || crypto.randomUUID()).trim();
    let trackingToken = options.trackingToken || null;
    let html = options.html;
    if (!html) {
      const prepared = prepareInvoiceTrackingLink(invoiceForSend, trackingToken || sendOperationId);
      trackingToken = prepared.trackingToken;
      const pixelUrl = getEmailOpenTrackingPixelUrl(trackingToken);
      const ctaHref = getTrackedLinkUrl(trackingToken, prepared.url);
      const invoiceForHtml = {
        ...invoiceForSend,
        delivery_date:
          invoiceForSend.delivery_date || invoiceForSend.due_date || new Date().toISOString(),
      };
      html = generateInvoiceEmailHtml(invoiceForHtml, client, userData, ctaHref, pixelUrl);
    } else if (!trackingToken) {
      trackingToken = sendOperationId;
    }

    const idempotencyKey = sendOperationId || trackingToken;
    const existingLog = await findMessageLogByTrackingToken(idempotencyKey);
    const alreadyDelivered = Boolean(existingLog);
    const sentAt = new Date().toISOString();

    if (!alreadyDelivered) {
      const bid = invoiceForSend.banking_detail_id && String(invoiceForSend.banking_detail_id).trim();
      let bankingRow = null;
      if (bid) {
        try {
          bankingRow = await BankingDetail.get(bid);
        } catch {
          bankingRow = null;
        }
      }

      let pdfBlob;
      try {
        pdfBlob = await generateInvoicePDF({
          invoice: invoiceForSend,
          client,
          user: userData,
          bankingDetail: bankingRow,
        });
      } catch (pdfErr) {
        console.error('Invoice PDF generation failed:', pdfErr);
        throw new Error('Invoice PDF generation failed. Please try again.');
      }
      const pdfBase64 = await pdfBlobToBase64(pdfBlob);
      if (!pdfBase64) {
        throw new Error('Invoice PDF generation failed. Please try again.');
      }

      const subject = `Invoice #${invoiceForSend.invoice_number || ''} from ${invoiceForSend.owner_company_name || userData?.company_name || 'Us'}`;
      const filename = `invoice-${invoiceForSend.invoice_number || invoiceForSend.reference_number || invoiceForSend.id || 'invoice'}.pdf`;

      await dispatchInvoiceEmailViaCanonicalPath({
        pdfBase64,
        email,
        subject,
        html,
        filename,
        invoiceNum: invoiceForSend.invoice_number || invoiceForSend.reference_number || invoiceForSend.id,
        fromName: userData?.company_name || userData?.full_name || 'Paidly',
        clientName: client?.name || 'there',
        amountDue: invoiceForSend.total_amount ?? '',
        dueDate: invoiceForSend.delivery_date || invoiceForSend.due_date || '',
        idempotencyKey,
      });

      try {
        await persistInvoiceTrackingLog(
          { ...invoiceForSend, client_id: client?.id || invoiceForSend.client_id },
          'email',
          email,
          trackingToken || idempotencyKey,
          sentAt
        );
      } catch (e) {
        console.warn('Failed to record message log after send:', e);
      }
    }

    const brandPatch = userData ? snapshotDocumentBrandForPersist(userData) : {};
    const persistPatch = {
      sent_date: sentAt,
      sent_to_email: email,
      last_sent_date: sentAt,
      ...brandPatch,
    };
    if (options.markSent !== false && invoiceForSend.status === 'draft') {
      persistPatch.status = 'sent';
    }
    await retryOnAbort(() => Invoice.update(invoiceForSend.id, persistPatch));
    if (!alreadyDelivered) {
      await recordDocumentSend('invoice', invoiceForSend.id, client?.id || invoiceForSend.client_id, 'email');
    }

    return {
      success: true,
      sentAt,
      invoiceId: invoiceForSend.id,
      idempotentReplay: alreadyDelivered,
    };
  } catch (error) {
    console.error('Error sending invoice email:', error);
    if (isAbortError(error)) {
      throw new Error('Request was interrupted. Please try again.');
    }
    throw error instanceof Error
      ? error
      : new Error(userFacingInvoiceSendError(error, 'Invoice could not be sent. Please try again.'));
  } finally {
    endCriticalSessionOperation();
  }
}

/**
 * Load invoice + client and send via the canonical email path.
 * Used by the sync queue (SEND_INVOICE) and sendDraftInvoice.
 *
 * @param {string} invoiceId
 * @param {object} [options]
 */
export const sendInvoiceToClient = async (invoiceId, options = {}) => {
  try {
    const invoice = await retryOnAbort(() => Invoice.get(invoiceId));
    if (!invoice) {
      throw new Error('Invoice not found.');
    }
    if (!invoice.client_id) {
      throw new Error('Invoice has no client.');
    }
    const client = await retryOnAbort(() => Client.get(invoice.client_id));
    if (!client) {
      throw new Error('Client not found.');
    }
    return await sendInvoicePdfEmailToClient(invoice, client, options);
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
  try {
    const invoice = await retryOnAbort(() => Invoice.get(invoiceId));
    if (!invoice) {
      throw new Error('Invoice not found.');
    }
    if (invoice.status === 'draft') {
      throw new Error('Cannot resend a draft invoice. Send it first.');
    }

    const result = await sendInvoiceToClient(invoiceId, { ...options, markSent: false });
    try {
      await retryOnAbort(() =>
        Invoice.update(invoiceId, {
          resend_count: (invoice.resend_count || 0) + 1,
        })
      );
    } catch (e) {
      console.warn('Failed to increment resend_count after successful resend:', e);
    }

    return {
      success: true,
      resentAt: result?.sentAt || new Date().toISOString(),
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
  sendInvoicePdfEmailToClient,
  dispatchInvoiceEmailViaCanonicalPath,
  prepareInvoiceTrackingLink,
  persistInvoiceTrackingLog,
  sendDraftInvoice,
  saveInvoiceAsDraft,
  updateDraftInvoice,
  getDraftInvoices,
  deleteDraftInvoice,
  resendInvoice,
  scheduleInvoiceSend,
};
