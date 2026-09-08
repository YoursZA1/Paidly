/**
 * Pure helpers for platform-admin overview + directory lists.
 * Runtime queries live in server/src/adminPlatformDirectory.js.
 */

export const ADMIN_DIRECTORY_KINDS = [
  "businesses",
  "plans",
  "affiliates",
  "invoices",
  "quotes",
  "pos",
  "payments",
  "recurring",
  "employees",
  "payroll",
  "leave",
  "attendance",
  "payslips",
  "transactions",
  "payment-intents",
  "refunds",
  "templates",
  "integrations",
];

export const ADMIN_REVENUE_PERIODS = ["daily", "weekly", "monthly", "yearly"];
export const DIRECTORY_LIMIT_MAX = 200;
export const DIRECTORY_LIMIT_DEFAULT = 50;

/**
 * PostgREST `.limit()` / PostgreSQL LIMIT is an integer row count.
 * A decimal such as 1.25 is not a valid LIMIT — do not truncate it.
 */
export function resolveDirectoryLimit(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: DIRECTORY_LIMIT_DEFAULT };
  }
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > DIRECTORY_LIMIT_MAX) {
    return { ok: false, value: n };
  }
  return { ok: true, value: n };
}

export function isIntegerBindError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("invalid input syntax for type integer");
}

export function logIntegerBindError(scope, details = {}) {
  const numericValue = Number(details.value);
  const safe = {
    scope,
    table: details.table || null,
    column: details.column || null,
    operation: details.operation || null,
    value: Number.isFinite(numericValue) ? numericValue : null,
    valueType: details.valueType || typeof details.value,
    message: details.message || null,
  };
  console.error("[integer-bind]", safe);
}

export function normalizeAdminPeriod(raw) {
  const p = String(raw || "monthly").trim().toLowerCase();
  return ADMIN_REVENUE_PERIODS.includes(p) ? p : "monthly";
}

export function startOfUtcDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUtcDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfUtcMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function startOfUtcYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * @param {string} period
 * @param {Date} [now]
 */
export function resolvePeriodWindow(period, now = new Date()) {
  const normalized = normalizeAdminPeriod(period);
  const to = now;
  if (normalized === "daily") {
    const from = startOfUtcDay(now);
    const prevFrom = addUtcDays(from, -1);
    return {
      period: normalized,
      from,
      to,
      prevFrom,
      prevTo: from,
      compareLabel: "vs yesterday",
    };
  }
  if (normalized === "weekly") {
    const from = addUtcDays(startOfUtcDay(now), -7);
    return {
      period: normalized,
      from,
      to,
      prevFrom: addUtcDays(from, -7),
      prevTo: from,
      compareLabel: "vs prior 7 days",
    };
  }
  if (normalized === "yearly") {
    const from = startOfUtcYear(now);
    const prevFrom = new Date(Date.UTC(from.getUTCFullYear() - 1, 0, 1));
    return {
      period: normalized,
      from,
      to,
      prevFrom,
      prevTo: from,
      compareLabel: "vs last year",
    };
  }
  const from = startOfUtcMonth(now);
  const prevFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  return {
    period: normalized,
    from,
    to,
    prevFrom,
    prevTo: from,
    compareLabel: "vs last month",
  };
}

export function percentChange(current, previous) {
  const cur = Number(current);
  const prev = Number(previous);
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

export function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function sumField(rows, field) {
  let total = 0;
  for (const row of rows || []) {
    total += money(row?.[field]);
  }
  return money(total);
}

export function inWindow(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t < to.getTime();
}

export function isMissingRelationError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

export function healthStatus({ critical = 0, attention = 0 } = {}) {
  if (Number(critical) > 0) return "critical";
  if (Number(attention) > 0) return "attention";
  return "healthy";
}

export function buildSparkline(dailyAmounts = []) {
  return (dailyAmounts || []).slice(-7).map((n) => money(n));
}

export function countExact(result) {
  if (!result || result.unavailable) return null;
  return typeof result.count === "number" ? result.count : null;
}
