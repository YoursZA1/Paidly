/**
 * App logic – central place for business rules.
 * Use these in components and hooks for consistent behavior.
 *
 * @see ./README.md
 * @see /INVOICE_SYNC_LOGIC.md
 * @see /PARTIAL_PAYMENTS_LOGIC.md
 */
export {
  canEditInvoice,
  canRecordPayment,
  getInvoiceDisplayStatus,
  getInvoiceAutoStatusUpdate,
  isInvoiceStatusTransitionAllowed,
  validatePaymentAmount,
  getInvoiceRemainingBalance,
  getDerivedStatus,
  getAutoStatusUpdate,
  isManualStatusChangeAllowed,
} from './invoiceLogic';
