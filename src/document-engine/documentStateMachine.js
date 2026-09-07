import { DOCUMENT_TYPES } from "./documentTypes";
import { getTypeDef } from "./documentCatalog";
import {
  INVOICE_STATUS,
  QUOTE_STATUS,
  INVOICE_TRANSITIONS,
  QUOTE_TRANSITIONS,
  normalizeInvoiceStatus,
  normalizeQuoteStatus,
  canTransitionInvoiceStatus,
  canTransitionQuoteStatus,
} from "@shared/commercial/documentStatuses.js";

/** @typedef {'invoice' | 'quote' | 'payslip'} LegacyDocumentType */

export const INVOICE_STATUSES = Object.freeze({
  ...INVOICE_STATUS,
  /** @deprecated Use `void`. Kept so existing hub callers keep compiling. */
  cancelled: INVOICE_STATUS.void,
});

export const QUOTE_STATUSES = QUOTE_STATUS;

export const PAYSLIP_STATUSES = Object.freeze({
  draft: "draft",
  sent: "sent",
  paid: "paid",
});

const LEGACY_TYPES = new Set(Object.values(DOCUMENT_TYPES));

/** @type {Record<LegacyDocumentType, Record<string, string[]>>} */
const LEGACY_ALLOWED_EDGES = Object.freeze({
  [DOCUMENT_TYPES.invoice]: INVOICE_TRANSITIONS,
  [DOCUMENT_TYPES.quote]: QUOTE_TRANSITIONS,
  [DOCUMENT_TYPES.payslip]: {
    [PAYSLIP_STATUSES.draft]: [PAYSLIP_STATUSES.sent],
    [PAYSLIP_STATUSES.sent]: [PAYSLIP_STATUSES.paid],
  },
});

/**
 * Status transitions for catalog hub types (all non-legacy types use their flow group).
 * Vocabulary aligns with `STATUS_FLOWS` in documentCatalog.js.
 */
const FLOW_ALLOWED_EDGES = Object.freeze({
  financial: {
    draft: ["sent", "cancelled", "archived"],
    sent: ["viewed", "paid", "overdue", "cancelled", "archived"],
    viewed: ["paid", "overdue", "cancelled", "archived"],
    paid: ["archived"],
    overdue: ["paid", "cancelled", "archived"],
    cancelled: ["archived"],
    archived: [],
  },
  signature: {
    draft: ["pending", "sent", "cancelled", "archived"],
    pending: ["sent", "signed", "cancelled", "archived"],
    sent: ["viewed", "signed", "cancelled", "archived"],
    viewed: ["signed", "cancelled", "archived"],
    signed: ["completed", "cancelled", "archived"],
    completed: ["archived"],
    cancelled: ["archived"],
    archived: [],
  },
  approval: {
    draft: ["pending", "cancelled", "archived"],
    pending: ["approved", "cancelled", "archived"],
    approved: ["sent", "completed", "cancelled", "archived"],
    sent: ["completed", "cancelled", "archived"],
    completed: ["archived"],
    cancelled: ["archived"],
    archived: [],
  },
  report: {
    draft: ["pending", "completed", "archived"],
    pending: ["approved", "completed", "archived"],
    approved: ["completed", "archived"],
    completed: ["archived"],
    archived: [],
  },
  simple: {
    draft: ["completed", "archived"],
    completed: ["archived"],
    archived: [],
  },
});

function edgesForType(type) {
  if (LEGACY_TYPES.has(type)) {
    return LEGACY_ALLOWED_EDGES[type] || null;
  }
  const def = getTypeDef(type);
  if (!def) return null;
  const flow = def.flow || "financial";
  return FLOW_ALLOWED_EDGES[flow] || FLOW_ALLOWED_EDGES.financial;
}

function normalizeLegacyStatus(type, status) {
  if (type === DOCUMENT_TYPES.invoice) return normalizeInvoiceStatus(status);
  if (type === DOCUMENT_TYPES.quote) return normalizeQuoteStatus(status);
  return status;
}

/**
 * @param {string} type
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransitionStatus(type, from, to) {
  if (type === DOCUMENT_TYPES.invoice) {
    return canTransitionInvoiceStatus(from, to);
  }
  if (type === DOCUMENT_TYPES.quote) {
    return canTransitionQuoteStatus(from, to);
  }
  if (from === to) return true;
  const edges = edgesForType(type);
  if (!edges) return false;
  const next = edges[from];
  return Array.isArray(next) && next.includes(to);
}

/**
 * @param {string} type
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
 * @param {string} type
 * @param {string} current
 * @returns {string[]}
 */
export function allowedNextStatuses(type, current) {
  const edges = edgesForType(type);
  if (!edges) return [];
  const key = normalizeLegacyStatus(type, current);
  return edges[key] ? [...edges[key]] : [];
}
