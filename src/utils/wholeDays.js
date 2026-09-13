/**
 * Whole-day counts for integer columns (lead_time_days, payment_terms_days).
 * Do not send 1.25 — Postgres integer bind fails. Days stay whole numbers.
 */
export function asWholeDays(value) {
  if (value == null || value === "") return null;
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
