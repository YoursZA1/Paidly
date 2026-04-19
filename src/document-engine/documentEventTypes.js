import { DOCUMENT_TYPES } from "./documentTypes";
import { INVOICE_STATUSES, QUOTE_STATUSES } from "./documentStateMachine";

/**
 * Canonical `document_events.event_type` values — record user/system actions, not only row outcomes.
 * @readonly
 */
export const DOCUMENT_EVENT_TYPES = Object.freeze({
  created: "created",
  updated: "updated",
  sent: "sent",
  viewed: "viewed",
  accepted: "accepted",
  paid: "paid",
  /** Fallback when status moves in a way that is not one of the primary actions above. */
  status_changed: "status_changed",
  converted: "converted",
  created_from_quote: "created_from_quote",
});

function sentTargetForType(docType) {
  if (docType === DOCUMENT_TYPES.quote) return QUOTE_STATUSES.sent;
  if (docType === DOCUMENT_TYPES.payslip) return PAYSLIP_STATUSES.sent;
  return INVOICE_STATUSES.sent;
}

/**
 * Map a status transition to the primary lifecycle event (for timeline truth).
 * @param {string} docType
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {string | null} event_type, or null if no status change
 */
export function resolveLifecycleEventType(docType, fromStatus, toStatus) {
  if (fromStatus === toStatus) return null;
  if (toStatus === sentTargetForType(docType)) return DOCUMENT_EVENT_TYPES.sent;
  if (docType === DOCUMENT_TYPES.quote && toStatus === QUOTE_STATUSES.accepted) {
    return DOCUMENT_EVENT_TYPES.accepted;
  }
  if (
    (docType === DOCUMENT_TYPES.invoice || docType === DOCUMENT_TYPES.payslip) &&
    toStatus === INVOICE_STATUSES.paid
  ) {
    return DOCUMENT_EVENT_TYPES.paid;
  }
  return DOCUMENT_EVENT_TYPES.status_changed;
}
