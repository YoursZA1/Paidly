/**
 * Canonical subscription_invoices.status values — ALLOWED ONLY. Never invent.
 * SaaS tax invoices after verified payment (≠ Document Engine public.invoices).
 */

/** @typedef {'draft'|'paid'|'void'|'cancelled'} SubscriptionInvoiceStatus */

/** @type {readonly SubscriptionInvoiceStatus[]} */
export const SUBSCRIPTION_INVOICE_STATUSES = Object.freeze([
  "draft",
  "paid",
  "void",
  "cancelled",
]);

export const SUBSCRIPTION_INVOICE_STATUS = Object.freeze({
  DRAFT: "draft",
  PAID: "paid",
  VOID: "void",
  CANCELLED: "cancelled",
});

/** Human labels */
export const SUBSCRIPTION_INVOICE_LABELS = Object.freeze({
  draft: "Draft",
  paid: "Paid",
  void: "Void",
  cancelled: "Cancelled",
});

/**
 * @param {string} raw
 * @returns {SubscriptionInvoiceStatus | null}
 */
export function coerceSubscriptionInvoiceStatus(raw) {
  let s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === "canceled" || s === "cancel") s = "cancelled";
  if (SUBSCRIPTION_INVOICE_STATUSES.includes(/** @type {SubscriptionInvoiceStatus} */ (s))) {
    return /** @type {SubscriptionInvoiceStatus} */ (s);
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {SubscriptionInvoiceStatus}
 */
export function normalizeSubscriptionInvoiceStatus(raw) {
  const s = coerceSubscriptionInvoiceStatus(raw);
  if (!s) {
    throw new Error(
      `invalid subscription invoice status "${raw}" — allowed: ${SUBSCRIPTION_INVOICE_STATUSES.join(", ")}`
    );
  }
  return s;
}
