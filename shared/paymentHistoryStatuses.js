/**
 * Canonical payment_history.payment_status values — ALLOWED ONLY. Never invent.
 * Ledger is append-only: never delete rows.
 */

/** @typedef {'pending'|'completed'|'failed'|'cancelled'|'refunded'} PaymentHistoryStatus */

/** @type {readonly PaymentHistoryStatus[]} */
export const PAYMENT_HISTORY_STATUSES = Object.freeze([
  "pending",
  "completed",
  "failed",
  "cancelled",
  "refunded",
]);

export const PAYMENT_HISTORY_STATUS = Object.freeze({
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});

/**
 * Map PayFast / legacy labels → allow-list. Unknown → null.
 * @param {string} raw
 * @returns {PaymentHistoryStatus | null}
 */
export function coercePaymentHistoryStatus(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === "complete" || s === "completed" || s === "success" || s === "successful") {
    s = "completed";
  } else if (s === "fail" || s === "failed" || s === "error") {
    s = "failed";
  } else if (s === "cancel" || s === "canceled" || s === "cancelled") {
    s = "cancelled";
  } else if (s === "refund" || s === "refunded") {
    s = "refunded";
  } else if (s === "processing") {
    s = "pending";
  }
  if (PAYMENT_HISTORY_STATUSES.includes(/** @type {PaymentHistoryStatus} */ (s))) {
    return /** @type {PaymentHistoryStatus} */ (s);
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {PaymentHistoryStatus}
 */
export function normalizePaymentHistoryStatus(raw) {
  const s = coercePaymentHistoryStatus(raw);
  if (!s) {
    throw new Error(
      `invalid payment_history status "${raw}" — allowed: ${PAYMENT_HISTORY_STATUSES.join(", ")}`
    );
  }
  return s;
}
