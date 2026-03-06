/**
 * Invoice Send Service
 * Handles sending invoices to clients via email and notifications
 */

import { Invoice } from '@/api/entities';
import { retryOnAbort, isAbortError } from '@/utils/retryOnAbort';

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

    // Update invoice status to 'sent' (with retry on spurious AbortError)
    await retryOnAbort(() =>
      Invoice.update(invoiceId, {
        status: 'sent',
        sent_date: new Date().toISOString(),
      })
    );

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
