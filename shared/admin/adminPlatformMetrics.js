/**
 * Platform-admin metric contract.
 *
 * Paidly revenue = what customers pay Paidly (payment_history / subscriptions).
 * Platform usage = counts from tenant tables (invoices, quotes, POS, workforce).
 * Never mix customer invoice/POS amounts into Paidly revenue.
 */

export const PAIDLY_REVENUE_LEDGER = "payment_history";

export const CUSTOMER_MONEY_UNAVAILABLE_REASON =
  "Customer invoice and POS totals are tenant books, not Paidly revenue. Paidly revenue is payment_history (PayFast SaaS).";

export const PAGE_ANALYTICS_UNAVAILABLE_REASON =
  "Page-view and feature-click analytics are not stored yet. platform_events records product writes (invoice_created, quote_created, …); UI navigation is not ingested.";

export const TRIAL_CONVERSION_UNAVAILABLE_REASON =
  "subscription_events has no trial_converted type. Do not invent a conversion rate from plan-null or payment recency.";

export function adoptionRate(part, whole) {
  const a = Number(part);
  const b = Number(whole);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((a / b) * 1000) / 10;
}

export function successRate(success, total) {
  return adoptionRate(success, total);
}

export function metricSource(table, calculation, extra = {}) {
  return { table, calculation, refresh: "on request", ...extra };
}

export function isPlatformStaffRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" || r === "management" || r === "sales" || r === "support";
}

export function planFamilyLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "none") return "none";
  if (raw === "starter" || raw.startsWith("starter")) return "starter";
  if (raw === "business" || raw.startsWith("business")) return "business";
  if (raw === "growth" || raw.startsWith("growth")) return "growth";
  if (raw === "enterprise" || raw.startsWith("enterprise")) return "enterprise";
  if (raw === "individual") return "starter";
  if (raw === "sme") return "business";
  if (raw === "corporate") return "growth";
  return raw;
}
