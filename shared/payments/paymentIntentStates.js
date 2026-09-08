/**
 * Shared payment_intents status machine for POS and Documents.
 * Names match the existing table CHECK — do not invent a parallel vocabulary.
 */

export const PAYMENT_INTENT_STATUS = Object.freeze({
  pending: "pending",
  requires_action: "requires_action",
  processing: "processing",
  paid: "paid",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
  refunded: "refunded",
});

/** Intents that still represent an in-flight customer payment. */
export const ACTIVE_PAYMENT_INTENT_STATUSES = Object.freeze([
  PAYMENT_INTENT_STATUS.pending,
  PAYMENT_INTENT_STATUS.requires_action,
  PAYMENT_INTENT_STATUS.processing,
]);

export const TERMINAL_PAYMENT_INTENT_STATUSES = Object.freeze([
  PAYMENT_INTENT_STATUS.paid,
  PAYMENT_INTENT_STATUS.cancelled,
  PAYMENT_INTENT_STATUS.expired,
  PAYMENT_INTENT_STATUS.refunded,
]);

/**
 * Deterministic transitions. Same-status is idempotent (webhooks may repeat).
 * Failed rows stay failed — retry creates a new attempt row.
 */
export const PAYMENT_INTENT_TRANSITIONS = Object.freeze({
  [PAYMENT_INTENT_STATUS.pending]: [
    PAYMENT_INTENT_STATUS.requires_action,
    PAYMENT_INTENT_STATUS.processing,
    PAYMENT_INTENT_STATUS.paid,
    PAYMENT_INTENT_STATUS.failed,
    PAYMENT_INTENT_STATUS.cancelled,
    PAYMENT_INTENT_STATUS.expired,
  ],
  [PAYMENT_INTENT_STATUS.requires_action]: [
    PAYMENT_INTENT_STATUS.processing,
    PAYMENT_INTENT_STATUS.paid,
    PAYMENT_INTENT_STATUS.failed,
    PAYMENT_INTENT_STATUS.cancelled,
    PAYMENT_INTENT_STATUS.expired,
  ],
  [PAYMENT_INTENT_STATUS.processing]: [
    PAYMENT_INTENT_STATUS.paid,
    PAYMENT_INTENT_STATUS.failed,
    PAYMENT_INTENT_STATUS.cancelled,
    PAYMENT_INTENT_STATUS.expired,
  ],
  [PAYMENT_INTENT_STATUS.failed]: [],
  [PAYMENT_INTENT_STATUS.cancelled]: [],
  [PAYMENT_INTENT_STATUS.expired]: [],
  [PAYMENT_INTENT_STATUS.paid]: [PAYMENT_INTENT_STATUS.refunded],
  [PAYMENT_INTENT_STATUS.refunded]: [],
});

export function normalizePaymentIntentStatus(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return PAYMENT_INTENT_STATUS[key] || null;
}

export function isActivePaymentIntentStatus(status) {
  return ACTIVE_PAYMENT_INTENT_STATUSES.includes(normalizePaymentIntentStatus(status));
}

export function canTransitionPaymentIntentStatus(from, to) {
  const current = normalizePaymentIntentStatus(from);
  const next = normalizePaymentIntentStatus(to);
  if (!current || !next) return false;
  if (current === next) return true;
  return (PAYMENT_INTENT_TRANSITIONS[current] || []).includes(next);
}

/**
 * @returns {{ ok: true, same: boolean, next: string } | { ok: false, code: string, error: string }}
 */
export function applyPaymentIntentTransition(from, to) {
  const current = normalizePaymentIntentStatus(from);
  const next = normalizePaymentIntentStatus(to);
  if (!current || !next) {
    return { ok: false, code: "INVALID_INTENT_STATUS", error: "Unknown payment intent status" };
  }
  if (current === next) {
    return { ok: true, same: true, next };
  }
  if (!canTransitionPaymentIntentStatus(current, next)) {
    return {
      ok: false,
      code: "INVALID_INTENT_TRANSITION",
      error: `Cannot move payment intent from ${current} to ${next}`,
    };
  }
  return { ok: true, same: false, next };
}

export function isConfirmedPaymentIntent(status) {
  return normalizePaymentIntentStatus(status) === PAYMENT_INTENT_STATUS.paid;
}

export function paymentIntentIsExpired(row, now = new Date()) {
  if (!row?.expires_at) return false;
  if (TERMINAL_PAYMENT_INTENT_STATUSES.includes(normalizePaymentIntentStatus(row.status))) {
    return normalizePaymentIntentStatus(row.status) === PAYMENT_INTENT_STATUS.expired;
  }
  const at = new Date(row.expires_at);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}

/**
 * Ozow ITN / return Status values → payment_intents.status.
 * Complete is the only paid mapping. Success URL alone must not call this with Complete.
 */
export function mapOzowStatusToIntentStatus(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "complete" || key === "completed") return PAYMENT_INTENT_STATUS.paid;
  if (key === "cancelled" || key === "canceled") return PAYMENT_INTENT_STATUS.cancelled;
  if (key === "abandoned") return PAYMENT_INTENT_STATUS.failed;
  if (key === "error" || key === "failed") return PAYMENT_INTENT_STATUS.failed;
  if (key === "pendinginvestigation" || key === "pending" || key === "pending_investigation") {
    return PAYMENT_INTENT_STATUS.processing;
  }
  return null;
}
