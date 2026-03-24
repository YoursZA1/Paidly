/**
 * Invoice Send Service
 * Handles sending invoices to clients via email and notifications
 */

import { Invoice, DocumentSend, MessageLog, User } from '@/api/entities';
import { retryOnAbort, isAbortError } from '@/utils/retryOnAbort';
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
 * @returns {string} Full URL e.g. https://yourapp.com/api/email-track/{token}
 */
export const getEmailOpenTrackingPixelUrl = (trackingToken, baseUrl) => {
  const base = getTrackableBaseUrl(baseUrl);
  if (!base || !trackingToken) return '';
  return `${base}/api/email-track/${encodeURIComponent(trackingToken)}`;
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
  await MessageLog.create({
    document_type: 'invoice',
    document_id: invoice.id,
    client_id: invoice.client_id || null,
    channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
    recipient: recipient || null,
    sent_at: sentAt,
    tracking_token: token,
  });
  const origin = getTrackableBaseUrl();
  const url = `${origin}/view/${shareToken}?token=${token}`;
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
