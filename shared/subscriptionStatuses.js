/**
 * Canonical SaaS subscriptions.status values — ALLOWED ONLY. Never invent statuses.
 * Activation is server-only after verified PayFast ITN — never from the frontend.
 */

/**
 * @typedef {'pending'|'processing'|'active'|'past_due'|'failed'|'cancelled'|'expired'|'suspended'|'trialing'} SubscriptionStatus
 */

/** @type {readonly SubscriptionStatus[]} */
export const SUBSCRIPTION_STATUSES = Object.freeze([
  "pending",
  "processing",
  "active",
  "past_due",
  "failed",
  "cancelled",
  "expired",
  "suspended",
  "trialing",
]);

export const SUBSCRIPTION_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  SUSPENDED: "suspended",
  TRIALING: "trialing",
});

/** Statuses that grant paid product access (is_pro). */
export const PAID_ACCESS_STATUSES = Object.freeze(["active", "trialing"]);

/**
 * Map legacy writers → allowed vocabulary. Unknown → null (caller must not invent).
 * @param {string} raw
 * @returns {SubscriptionStatus | null}
 */
export function coerceSubscriptionStatus(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === "canceled" || s === "cancel" || s === "inactive") s = "cancelled";
  else if (s === "paused") s = "suspended";
  else if (s === "trial") s = "trialing";
  if (SUBSCRIPTION_STATUSES.includes(/** @type {SubscriptionStatus} */ (s))) {
    return /** @type {SubscriptionStatus} */ (s);
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {SubscriptionStatus}
 * @throws {Error} if status is missing or not in the allow-list
 */
export function normalizeSubscriptionStatus(raw) {
  const s = coerceSubscriptionStatus(raw);
  if (!s) {
    throw new Error(
      `invalid subscription status "${raw}" — allowed: ${SUBSCRIPTION_STATUSES.join(", ")}`
    );
  }
  return s;
}

/**
 * @param {string} status
 */
export function hasPaidAccess(status) {
  const s = coerceSubscriptionStatus(status);
  return s != null && PAID_ACCESS_STATUSES.includes(s);
}
