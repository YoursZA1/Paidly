/**
 * Canonical invoice and quote status machines.
 *
 * Reads accept historical aliases forever. Writes must be canonical and
 * follow the allowed transition graph. Hub `documents` statuses are separate.
 */

export const INVOICE_STATUS = Object.freeze({
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  partially_paid: "partially_paid",
  paid: "paid",
  overdue: "overdue",
  void: "void",
});

export const QUOTE_STATUS = Object.freeze({
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  converted: "converted",
});

export const INVOICE_STATUS_LIST = Object.freeze(Object.values(INVOICE_STATUS));
export const QUOTE_STATUS_LIST = Object.freeze(Object.values(QUOTE_STATUS));

/** Historical invoice values → canonical. Kept so old rows and query params still resolve. */
export const INVOICE_STATUS_ALIASES = Object.freeze({
  partial_paid: INVOICE_STATUS.partially_paid,
  sending: INVOICE_STATUS.sent,
  preparing: INVOICE_STATUS.sent,
  pending: INVOICE_STATUS.sent,
  cancelled: INVOICE_STATUS.void,
  canceled: INVOICE_STATUS.void,
  converted: INVOICE_STATUS.sent,
});

export const QUOTE_STATUS_ALIASES = Object.freeze({
  rejected: QUOTE_STATUS.declined,
});

export const INVOICE_STATUS_LABELS = Object.freeze({
  [INVOICE_STATUS.draft]: "Draft",
  [INVOICE_STATUS.sent]: "Sent",
  [INVOICE_STATUS.viewed]: "Viewed",
  [INVOICE_STATUS.partially_paid]: "Partially Paid",
  [INVOICE_STATUS.paid]: "Paid",
  [INVOICE_STATUS.overdue]: "Overdue",
  [INVOICE_STATUS.void]: "Void",
});

export const QUOTE_STATUS_LABELS = Object.freeze({
  [QUOTE_STATUS.draft]: "Draft",
  [QUOTE_STATUS.sent]: "Sent",
  [QUOTE_STATUS.viewed]: "Viewed",
  [QUOTE_STATUS.accepted]: "Accepted",
  [QUOTE_STATUS.declined]: "Declined",
  [QUOTE_STATUS.expired]: "Expired",
  [QUOTE_STATUS.converted]: "Converted",
});

/**
 * Invoice transitions. Happy path: draft → sent → viewed → partially_paid → paid.
 * Overdue and void are side exits from an open receivable.
 */
export const INVOICE_TRANSITIONS = Object.freeze({
  [INVOICE_STATUS.draft]: [INVOICE_STATUS.sent, INVOICE_STATUS.void],
  [INVOICE_STATUS.sent]: [
    INVOICE_STATUS.viewed,
    INVOICE_STATUS.partially_paid,
    INVOICE_STATUS.paid,
    INVOICE_STATUS.overdue,
    INVOICE_STATUS.void,
  ],
  [INVOICE_STATUS.viewed]: [
    INVOICE_STATUS.partially_paid,
    INVOICE_STATUS.paid,
    INVOICE_STATUS.overdue,
    INVOICE_STATUS.void,
  ],
  [INVOICE_STATUS.overdue]: [
    INVOICE_STATUS.partially_paid,
    INVOICE_STATUS.paid,
    INVOICE_STATUS.void,
  ],
  [INVOICE_STATUS.partially_paid]: [
    INVOICE_STATUS.paid,
    INVOICE_STATUS.overdue,
    INVOICE_STATUS.void,
  ],
  [INVOICE_STATUS.paid]: [],
  [INVOICE_STATUS.void]: [],
});

/**
 * Quote transitions. Happy path: draft → sent → viewed → accepted → converted.
 * Draft may convert directly (Phase 06). Declined / expired are terminal exits.
 */
export const QUOTE_TRANSITIONS = Object.freeze({
  [QUOTE_STATUS.draft]: [QUOTE_STATUS.sent, QUOTE_STATUS.declined, QUOTE_STATUS.converted],
  [QUOTE_STATUS.sent]: [
    QUOTE_STATUS.viewed,
    QUOTE_STATUS.accepted,
    QUOTE_STATUS.declined,
    QUOTE_STATUS.expired,
    QUOTE_STATUS.converted,
  ],
  [QUOTE_STATUS.viewed]: [
    QUOTE_STATUS.accepted,
    QUOTE_STATUS.declined,
    QUOTE_STATUS.expired,
    QUOTE_STATUS.converted,
  ],
  [QUOTE_STATUS.accepted]: [QUOTE_STATUS.converted],
  [QUOTE_STATUS.declined]: [],
  [QUOTE_STATUS.expired]: [],
  [QUOTE_STATUS.converted]: [],
});

function lowerStatus(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function isCanonicalInvoiceStatus(raw) {
  return INVOICE_STATUS_LIST.includes(lowerStatus(raw));
}

export function isCanonicalQuoteStatus(raw) {
  return QUOTE_STATUS_LIST.includes(lowerStatus(raw));
}

export function normalizeInvoiceStatus(raw) {
  const status = lowerStatus(raw);
  if (!status) return INVOICE_STATUS.draft;
  if (INVOICE_STATUS_ALIASES[status]) return INVOICE_STATUS_ALIASES[status];
  if (isCanonicalInvoiceStatus(status)) return status;
  return status;
}

export function normalizeQuoteStatus(raw) {
  const status = lowerStatus(raw);
  if (!status) return QUOTE_STATUS.draft;
  if (QUOTE_STATUS_ALIASES[status]) return QUOTE_STATUS_ALIASES[status];
  if (isCanonicalQuoteStatus(status)) return status;
  return status;
}

export function assertCanonicalInvoiceStatus(raw) {
  const next = normalizeInvoiceStatus(raw);
  if (!isCanonicalInvoiceStatus(next)) {
    throw new Error(`Unsupported invoice status: ${raw}`);
  }
  return next;
}

export function assertCanonicalQuoteStatus(raw) {
  const next = normalizeQuoteStatus(raw);
  if (!isCanonicalQuoteStatus(next)) {
    throw new Error(`Unsupported quote status: ${raw}`);
  }
  return next;
}

export function canTransitionInvoiceStatus(from, to) {
  const current = normalizeInvoiceStatus(from);
  const next = normalizeInvoiceStatus(to);
  if (current === next) return true;
  if (!isCanonicalInvoiceStatus(current) || !isCanonicalInvoiceStatus(next)) return false;
  return (INVOICE_TRANSITIONS[current] || []).includes(next);
}

export function canTransitionQuoteStatus(from, to) {
  const current = normalizeQuoteStatus(from);
  const next = normalizeQuoteStatus(to);
  if (current === next) return true;
  if (!isCanonicalQuoteStatus(current) || !isCanonicalQuoteStatus(next)) return false;
  return (QUOTE_TRANSITIONS[current] || []).includes(next);
}

export function assertInvoiceTransition(from, to) {
  if (!canTransitionInvoiceStatus(from, to)) {
    throw new Error(`Invalid invoice status transition: ${from} → ${to}`);
  }
}

export function assertQuoteTransition(from, to) {
  if (!canTransitionQuoteStatus(from, to)) {
    throw new Error(`Invalid quote status transition: ${from} → ${to}`);
  }
}

export function allowedNextInvoiceStatuses(current) {
  const status = normalizeInvoiceStatus(current);
  return [...(INVOICE_TRANSITIONS[status] || [])];
}

export function allowedNextQuoteStatuses(current) {
  const status = normalizeQuoteStatus(current);
  return [...(QUOTE_TRANSITIONS[status] || [])];
}

/**
 * Normalize a write and enforce the graph.
 * Inserts may be any canonical status (POS tax copies, CSV history).
 * Updates must follow the transition graph.
 */
export function sanitizeInvoiceStatusWrite(requested, existingStatus = null) {
  const next = assertCanonicalInvoiceStatus(
    requested == null || requested === "" ? INVOICE_STATUS.draft : requested
  );
  if (existingStatus == null || existingStatus === "") return next;
  assertInvoiceTransition(existingStatus, next);
  return next;
}

export function sanitizeQuoteStatusWrite(requested, existingStatus = null) {
  const next = assertCanonicalQuoteStatus(
    requested == null || requested === "" ? QUOTE_STATUS.draft : requested
  );
  if (next === QUOTE_STATUS.converted) {
    throw new Error("Quote conversion must use convert_quote_to_invoice");
  }
  if (existingStatus == null || existingStatus === "") return next;
  assertQuoteTransition(existingStatus, next);
  return next;
}

export function invoiceStatusesMatch(left, right) {
  return normalizeInvoiceStatus(left) === normalizeInvoiceStatus(right);
}

export function quoteStatusesMatch(left, right) {
  return normalizeQuoteStatus(left) === normalizeQuoteStatus(right);
}

export function invoiceStatusIn(raw, ...canonical) {
  const status = normalizeInvoiceStatus(raw);
  return canonical.includes(status);
}

export function isInvoicePaidLike(status) {
  return invoiceStatusIn(status, INVOICE_STATUS.paid, INVOICE_STATUS.partially_paid);
}

export function isInvoiceFullyPaid(status) {
  return normalizeInvoiceStatus(status) === INVOICE_STATUS.paid;
}

export function isInvoiceVoidLike(status) {
  return normalizeInvoiceStatus(status) === INVOICE_STATUS.void;
}

export function isInvoiceOpenReceivable(status) {
  return invoiceStatusIn(
    status,
    INVOICE_STATUS.sent,
    INVOICE_STATUS.viewed,
    INVOICE_STATUS.overdue,
    INVOICE_STATUS.partially_paid
  );
}

export function isInvoiceClosed(status) {
  return invoiceStatusIn(status, INVOICE_STATUS.draft, INVOICE_STATUS.void);
}

export function isInvoiceExcludedFromAging(status) {
  return (
    isInvoicePaidLike(status) ||
    invoiceStatusIn(status, INVOICE_STATUS.draft, INVOICE_STATUS.void)
  );
}

export function isInvoiceEditLocked(status) {
  return invoiceStatusIn(
    status,
    INVOICE_STATUS.paid,
    INVOICE_STATUS.partially_paid,
    INVOICE_STATUS.void
  );
}

export function isInvoicePaymentLocked(status) {
  return invoiceStatusIn(status, INVOICE_STATUS.paid, INVOICE_STATUS.void);
}

export function isQuoteTerminal(status) {
  return [QUOTE_STATUS.declined, QUOTE_STATUS.expired, QUOTE_STATUS.converted].includes(
    normalizeQuoteStatus(status)
  );
}

export function invoiceStatusLabel(status) {
  const canonical = normalizeInvoiceStatus(status);
  return INVOICE_STATUS_LABELS[canonical] || String(status || "Draft").replace(/_/g, " ");
}

export function quoteStatusLabel(status) {
  const canonical = normalizeQuoteStatus(status);
  return QUOTE_STATUS_LABELS[canonical] || String(status || "Draft").replace(/_/g, " ");
}

export const INVOICE_FILTER_OPTIONS = Object.freeze(
  INVOICE_STATUS_LIST.map((value) => ({
    value,
    label: INVOICE_STATUS_LABELS[value],
  }))
);

export const QUOTE_FILTER_OPTIONS = Object.freeze(
  QUOTE_STATUS_LIST.map((value) => ({
    value,
    label: QUOTE_STATUS_LABELS[value],
  }))
);
