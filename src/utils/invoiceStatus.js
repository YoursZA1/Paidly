import { appendHistory, createHistoryEntry } from './invoiceHistory';
import {
  INVOICE_STATUS,
  normalizeInvoiceStatus,
  canTransitionInvoiceStatus,
  isInvoiceVoidLike,
} from '@shared/commercial/documentStatuses.js';

const sumPayments = (payments = []) => payments.reduce((sum, p) => sum + (p.amount || 0), 0);

const isOverdue = (invoice, now = new Date()) => {
  if (!invoice?.delivery_date) return false;
  const due = new Date(invoice.delivery_date);
  return now > due;
};

export const getDerivedStatus = (invoice, options = {}) => {
  const { markViewed = false, now = new Date() } = options;

  if (!invoice) return INVOICE_STATUS.draft;
  const current = normalizeInvoiceStatus(invoice.status);
  if (isInvoiceVoidLike(current)) return INVOICE_STATUS.void;

  const totalPaid = sumPayments(invoice.payments || []);
  const total = invoice.total_amount || 0;

  if (total > 0 && totalPaid >= total) return INVOICE_STATUS.paid;
  if (totalPaid > 0) return INVOICE_STATUS.partially_paid;

  if (current === INVOICE_STATUS.draft) return INVOICE_STATUS.draft;

  if (markViewed && current === INVOICE_STATUS.sent) return INVOICE_STATUS.viewed;

  if (
    [INVOICE_STATUS.sent, INVOICE_STATUS.viewed, INVOICE_STATUS.overdue].includes(current) &&
    isOverdue(invoice, now)
  ) {
    return INVOICE_STATUS.overdue;
  }

  if (current === INVOICE_STATUS.viewed) return INVOICE_STATUS.viewed;
  if (current === INVOICE_STATUS.sent) return INVOICE_STATUS.sent;

  return current || INVOICE_STATUS.draft;
};

export const getAutoStatusUpdate = (invoice, options = {}) => {
  const nextStatus = getDerivedStatus(invoice, options);
  const current = normalizeInvoiceStatus(invoice?.status);

  if (!invoice || !nextStatus || current === nextStatus) {
    return null;
  }

  if (!canTransitionInvoiceStatus(current, nextStatus)) {
    return null;
  }

  const changes = [{ field: 'status', from: invoice.status, to: nextStatus }];
  const update = { status: nextStatus };

  if (nextStatus === INVOICE_STATUS.viewed) {
    update.viewed_date = new Date().toISOString();
  }

  if (nextStatus === INVOICE_STATUS.overdue) {
    update.overdue_date = new Date().toISOString();
  }

  const historyEntry = createHistoryEntry({
    action: 'status_auto',
    summary: `Status auto-updated to ${nextStatus.replace('_', ' ')}`,
    changes,
    meta: { reason: 'auto' },
  });

  update.version_history = appendHistory(invoice.version_history, historyEntry);

  return update;
};

export const isManualStatusChangeAllowed = (currentStatus, nextStatus) => {
  if (!currentStatus || !nextStatus) return false;
  if (normalizeInvoiceStatus(currentStatus) === normalizeInvoiceStatus(nextStatus)) return false;
  return canTransitionInvoiceStatus(currentStatus, nextStatus);
};
