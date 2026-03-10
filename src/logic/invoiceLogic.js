/**
 * Central invoice business logic.
 * Single source of truth for: editability, payment recording, status, validation.
 * Uses utils/invoiceStatus for derived status and auto-updates.
 */
import { getDerivedStatus, getAutoStatusUpdate, isManualStatusChangeAllowed } from '@/utils/invoiceStatus';

/** Statuses that lock the invoice from editing (financial record integrity). */
const EDIT_LOCKED_STATUSES = Object.freeze(['paid', 'partial_paid', 'cancelled']);

/** Statuses that prevent recording new payments (already fully paid or cancelled). */
const RECORD_PAYMENT_LOCKED_STATUSES = Object.freeze(['paid', 'cancelled']);

/**
 * Whether the invoice can be edited (amounts, items, client, etc.).
 * Paid, partial_paid, and cancelled invoices are locked.
 * @param {{ status?: string }} invoice - Invoice object with at least status
 * @returns {boolean}
 */
export function canEditInvoice(invoice) {
  if (!invoice) return false;
  const status = (invoice.status || 'draft').toLowerCase();
  return !EDIT_LOCKED_STATUSES.includes(status);
}

/**
 * Whether the user can record a payment against this invoice.
 * Cannot record when status is paid or cancelled.
 * @param {{ status?: string }} invoice - Invoice object with at least status
 * @returns {boolean}
 */
export function canRecordPayment(invoice) {
  if (!invoice) return false;
  const status = (invoice.status || 'draft').toLowerCase();
  return !RECORD_PAYMENT_LOCKED_STATUSES.includes(status);
}

/**
 * Get the status to display for an invoice (derived from payments and due date if needed).
 * Pass payments when you have them so status reflects total paid.
 * @param {Object} invoice - Invoice object (may include payments)
 * @param {Object} [options] - { markViewed: boolean, now: Date }
 * @returns {string} - One of draft, sent, viewed, overdue, partial_paid, paid, cancelled
 */
export function getInvoiceDisplayStatus(invoice, options = {}) {
  return getDerivedStatus(invoice, options);
}

/**
 * Get the auto status update payload to apply after payments change (e.g. after recording payment).
 * Returns null if no update needed.
 * @param {Object} invoice - Invoice with payments array
 * @param {Object} [options] - { markViewed, now }
 * @returns {Object | null} - Update payload for Invoice.update() or null
 */
export function getInvoiceAutoStatusUpdate(invoice, options = {}) {
  return getAutoStatusUpdate(invoice, options);
}

/**
 * Check if a manual status change from currentStatus to nextStatus is allowed.
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
export function isInvoiceStatusTransitionAllowed(currentStatus, nextStatus) {
  return isManualStatusChangeAllowed(currentStatus, nextStatus);
}

/**
 * Validate a payment amount against an invoice's remaining balance.
 * @param {Object} invoice - Invoice with total_amount
 * @param {Array<{ amount: number }>} [payments] - List of payments for this invoice
 * @param {number} amount - Proposed payment amount
 * @param {number} [tolerance=0.01] - Allowed overpayment tolerance (e.g. rounding)
 * @returns {{ valid: boolean, error?: string, remainingBalance: number }}
 */
export function validatePaymentAmount(invoice, payments = [], amount, tolerance = 0.01) {
  const total = Number(invoice?.total_amount) || 0;
  const totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingBalance = Math.max(0, total - totalPaid);

  if (amount == null || Number(amount) <= 0) {
    return { valid: false, error: 'Amount must be greater than 0.', remainingBalance };
  }

  const numAmount = Number(amount);
  if (numAmount > remainingBalance + tolerance) {
    return {
      valid: false,
      error: `Amount cannot exceed remaining balance (${remainingBalance.toFixed(2)}).`,
      remainingBalance,
    };
  }

  return { valid: true, remainingBalance };
}

/**
 * Get remaining balance for an invoice given its payments.
 * @param {Object} invoice - Invoice with total_amount
 * @param {Array<{ amount: number }>} [payments] - Payments for this invoice
 * @returns {{ remaining: number, totalPaid: number, total: number }}
 */
export function getInvoiceRemainingBalance(invoice, payments = []) {
  const total = Number(invoice?.total_amount) || 0;
  const totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, total - totalPaid);
  return { total, totalPaid, remaining };
}

// Re-export for consumers that want to use the low-level utils from one place
export {
  getDerivedStatus,
  getAutoStatusUpdate,
  isManualStatusChangeAllowed,
};
