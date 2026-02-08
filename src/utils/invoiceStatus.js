import { appendHistory, createHistoryEntry } from './invoiceHistory';

const sumPayments = (payments = []) => payments.reduce((sum, p) => sum + (p.amount || 0), 0);

const isOverdue = (invoice, now = new Date()) => {
  if (!invoice?.delivery_date) return false;
  const due = new Date(invoice.delivery_date);
  return now > due;
};

export const getDerivedStatus = (invoice, options = {}) => {
  const { markViewed = false, now = new Date() } = options;

  if (!invoice) return 'draft';
  if (invoice.status === 'cancelled') return 'cancelled';

  const totalPaid = sumPayments(invoice.payments || []);
  const total = invoice.total_amount || 0;

  if (total > 0 && totalPaid >= total) return 'paid';
  if (totalPaid > 0) return 'partial_paid';

  if (invoice.status === 'draft') return 'draft';

  if (markViewed && invoice.status === 'sent') return 'viewed';

  if (['sent', 'viewed', 'overdue'].includes(invoice.status) && isOverdue(invoice, now)) {
    return 'overdue';
  }

  if (invoice.status === 'viewed') return 'viewed';
  if (invoice.status === 'sent') return 'sent';

  return invoice.status || 'draft';
};

export const getAutoStatusUpdate = (invoice, options = {}) => {
  const nextStatus = getDerivedStatus(invoice, options);

  if (!invoice || !nextStatus || invoice.status === nextStatus) {
    return null;
  }

  const changes = [{ field: 'status', from: invoice.status, to: nextStatus }];
  const update = { status: nextStatus };

  if (nextStatus === 'viewed') {
    update.viewed_date = new Date().toISOString();
  }

  if (nextStatus === 'overdue') {
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

const manualTransitionRules = {
  draft: new Set(['sent', 'cancelled']),
  sent: new Set(['viewed', 'partial_paid', 'paid', 'overdue', 'cancelled']),
  viewed: new Set(['partial_paid', 'paid', 'overdue', 'cancelled']),
  overdue: new Set(['partial_paid', 'paid', 'cancelled']),
  partial_paid: new Set(['paid', 'cancelled']),
  paid: new Set([]),
  cancelled: new Set([]),
};

export const isManualStatusChangeAllowed = (currentStatus, nextStatus) => {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return false;
  const allowed = manualTransitionRules[currentStatus] || new Set();
  return allowed.has(nextStatus);
};
