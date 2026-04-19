import { DOCUMENT_TYPES } from "./documentTypes";

/** @typedef {'invoice' | 'quote' | 'payslip'} DocumentType */

export const INVOICE_STATUSES = Object.freeze({
  draft: "draft",
  sent: "sent",
  paid: "paid",
  overdue: "overdue",
  cancelled: "cancelled",
});

export const QUOTE_STATUSES = Object.freeze({
  draft: "draft",
  sent: "sent",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  converted: "converted",
});

export const PAYSLIP_STATUSES = Object.freeze({
  draft: "draft",
  sent: "sent",
  paid: "paid",
});

/** @type {Record<DocumentType, Record<string, string[]>>} */
const ALLOWED_EDGES = Object.freeze({
  [DOCUMENT_TYPES.invoice]: {
    [INVOICE_STATUSES.draft]: [INVOICE_STATUSES.sent, INVOICE_STATUSES.cancelled],
    [INVOICE_STATUSES.sent]: [INVOICE_STATUSES.paid, INVOICE_STATUSES.overdue, INVOICE_STATUSES.cancelled],
    [INVOICE_STATUSES.overdue]: [INVOICE_STATUSES.paid, INVOICE_STATUSES.cancelled],
  },
  [DOCUMENT_TYPES.quote]: {
    [QUOTE_STATUSES.draft]: [QUOTE_STATUSES.sent, QUOTE_STATUSES.declined],
    [QUOTE_STATUSES.sent]: [QUOTE_STATUSES.accepted, QUOTE_STATUSES.declined, QUOTE_STATUSES.expired],
    [QUOTE_STATUSES.accepted]: [QUOTE_STATUSES.converted],
  },
  [DOCUMENT_TYPES.payslip]: {
    [PAYSLIP_STATUSES.draft]: [PAYSLIP_STATUSES.sent],
    [PAYSLIP_STATUSES.sent]: [PAYSLIP_STATUSES.paid],
  },
});

/**
 * @param {DocumentType} type
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransitionStatus(type, from, to) {
  const t = type === DOCUMENT_TYPES.quote ? DOCUMENT_TYPES.quote : type === DOCUMENT_TYPES.payslip ? DOCUMENT_TYPES.payslip : DOCUMENT_TYPES.invoice;
  const edges = ALLOWED_EDGES[t];
  if (!edges) return false;
  const next = edges[from];
  if (!next || !Array.isArray(next)) return false;
  return next.includes(to);
}

/**
 * @param {DocumentType} type
 * @param {string} from
 * @param {string} to
 */
export function assertTransition(type, from, to) {
  if (from === to) return;
  if (!canTransitionStatus(type, from, to)) {
    throw new Error(`Invalid status transition for ${type}: ${from} → ${to}`);
  }
}

/**
 * @param {DocumentType} type
 * @param {string} current
 * @returns {string[]}
 */
export function allowedNextStatuses(type, current) {
  const t =
    type === DOCUMENT_TYPES.quote ? DOCUMENT_TYPES.quote : type === DOCUMENT_TYPES.payslip ? DOCUMENT_TYPES.payslip : DOCUMENT_TYPES.invoice;
  const edges = ALLOWED_EDGES[t];
  if (!edges) return [];
  return edges[current] ? [...edges[current]] : [];
}
