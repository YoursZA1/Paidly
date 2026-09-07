/**
 * Central invoice business logic.
 * Single source of truth for: editability, payment recording, status, validation.
 * Uses utils/invoiceStatus for derived status and auto-updates.
 */
import { getDerivedStatus, getAutoStatusUpdate, isManualStatusChangeAllowed } from '@/utils/invoiceStatus';
import {
  isInvoiceEditLocked,
  isInvoicePaymentLocked,
} from '@shared/commercial/documentStatuses.js';
import { resolveCommercialDocumentTotals } from '@shared/commercial/normalizeCommercialDocument.js';

/**
 * Whether this invoice is a tax copy of a settled POS sale (not a receivable).
 * @param {{ pos_sale_event_id?: string }} invoice
 * @returns {boolean}
 */
export function isPosOriginInvoice(invoice) {
  return Boolean(invoice?.pos_sale_event_id);
}

/**
 * Whether the invoice can be edited (amounts, items, client, etc.).
 * Paid, partially paid, void, and POS tax-invoice copies are locked.
 * @param {{ status?: string, pos_sale_event_id?: string }} invoice
 * @returns {boolean}
 */
export function canEditInvoice(invoice) {
  if (!invoice) return false;
  if (isPosOriginInvoice(invoice)) return false;
  return !isInvoiceEditLocked(invoice.status);
}

/**
 * Whether the user can record a payment against this invoice.
 * Cannot record when status is paid or void, or when the invoice is a POS tax copy.
 * @param {{ status?: string, pos_sale_event_id?: string }} invoice
 * @returns {boolean}
 */
export function canRecordPayment(invoice) {
  if (!invoice) return false;
  if (isPosOriginInvoice(invoice)) return false;
  return !isInvoicePaymentLocked(invoice.status);
}

/**
 * Get the status to display for an invoice (derived from payments and due date if needed).
 * Pass payments when you have them so status reflects total paid.
 * @param {Object} invoice - Invoice object (may include payments)
 * @param {Object} [options] - { markViewed: boolean, now: Date }
 * @returns {string} - One of draft, sent, viewed, overdue, partially_paid, paid, void
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
  const { remaining: remainingBalance } = getInvoiceRemainingBalance(invoice, payments);

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
  const totals = resolveCommercialDocumentTotals(invoice, {
    preferStored: true,
    payments,
  });
  return {
    total: totals.grandTotal,
    totalPaid: totals.paidAmount,
    remaining: totals.balanceDue,
  };
}

// Re-export for consumers that want to use the low-level utils from one place
export {
  getDerivedStatus,
  getAutoStatusUpdate,
  isManualStatusChangeAllowed,
};
