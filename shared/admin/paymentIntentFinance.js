/**
 * Platform finance view of customer payment_intents.
 *
 * Counts and (for platform admins only) currency totals. Never a business,
 * intent id, or per-transaction timestamp. Callers may pass either one row
 * per intent or pre-grouped buckets from admin_payment_intent_finance_buckets().
 */

import { businessDateParts, money, startOfBusinessDay, startOfBusinessMonth } from "./adminPlatformDirectory.js";
import { adoptionRate, successRate } from "./adminPlatformMetrics.js";
import { paymentProviderLabel } from "../payments/paymentProviderCatalog.js";

export const PAYMENT_INTENT_FINANCE_COLUMNS =
  "source_kind, document_type, provider, amount, currency, status, created_at, metadata";

const SUCCESS = new Set(["paid", "succeeded", "completed"]);
const PENDING = new Set(["pending", "requires_action", "processing"]);
const FAILED = new Set(["failed"]);

export const PAYMENT_FINANCE_METHODS = Object.freeze([
  { key: "cash", label: "Cash" },
  { key: "eft", label: "EFT" },
  { key: "pos", label: "POS" },
  { key: "digital", label: "Online / Digital" },
  { key: "other", label: "Other" },
]);

export const PAYMENT_FINANCE_PRODUCTS = Object.freeze([
  { key: "pos", label: "POS payments" },
  { key: "invoice", label: "Invoice payments" },
  { key: "quote", label: "Quote payments" },
  { key: "recurring", label: "Recurring payments" },
]);

export const PAYMENT_FINANCE_PERIODS = Object.freeze([
  "today",
  "7d",
  "30d",
  "month",
  "previousMonth",
  "all",
]);

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayStart(now, daysBack) {
  const start = startOfBusinessDay(now);
  if (!daysBack) return start;
  return new Date(start.getTime() - daysBack * 24 * 60 * 60 * 1000);
}

export function businessDateKey(date = new Date()) {
  const { year, month, day } = businessDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive YYYY-MM-DD range, at most 366 days. Invalid input is ignored. */
export function parseFinanceCustomRange(fromRaw, toRaw) {
  const from = String(fromRaw || "").trim();
  const to = String(toRaw || "").trim();
  if (!DATE_KEY.test(from) || !DATE_KEY.test(to) || from > to) return null;
  const start = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)), -2, 0, 0, 0));
  const end = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)), -2, 0, 0, 0));
  const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const days = (endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 1 || days > 366) return null;
  return { from: start, to: endExclusive, fromKey: from, toKey: to };
}

export function paymentIntentFactFromRow(row) {
  const offline = row?.metadata?.offline_method;
  return {
    source_kind: row?.source_kind || null,
    document_type: row?.document_type || null,
    provider: row?.provider || null,
    amount: row?.amount,
    currency: row?.currency || null,
    status: row?.status || null,
    created_at: row?.created_at || null,
    offline_method: offline ? String(offline) : null,
    count: 1,
    amountSum: money(row?.amount),
  };
}

export function paymentIntentBucketFromRpc(row) {
  const day = String(row?.day || "").slice(0, 10);
  const parsed = parseFinanceCustomRange(day, day);
  return {
    method: row?.method || "other",
    product: row?.product || "other",
    provider: row?.provider || null,
    status: row?.status || null,
    currency: row?.currency || null,
    created_at: parsed ? parsed.from.toISOString() : null,
    count: Number(row?.intent_count || row?.count || 0),
    amountSum: money(row?.amount_sum ?? row?.amountSum),
  };
}

export function classifyPaymentIntentMethod(fact) {
  if (fact?.method) return String(fact.method);
  const provider = String(fact?.provider || "").trim().toLowerCase();
  const offline = String(fact?.offline_method || "").trim().toLowerCase();
  if (offline === "eft" || offline === "bank_transfer") return "eft";
  if (
    offline === "pos" ||
    offline === "card" ||
    offline === "credit_card" ||
    offline === "debit_card" ||
    provider === "card_terminal"
  ) {
    return "pos";
  }
  if (offline === "other" || offline === "mobile_payment" || offline === "check") return "other";
  if (provider === "cash" || offline === "cash") return "cash";
  if (provider && provider !== "cash") return "digital";
  return "other";
}

export function classifyPaymentIntentProduct(fact) {
  if (fact?.product) return String(fact.product);
  const source = String(fact?.source_kind || "").trim().toLowerCase();
  const doc = String(fact?.document_type || "").trim().toLowerCase();
  if (source === "pos") return "pos";
  if (doc === "quote") return "quote";
  if (doc === "recurring" || doc === "recurring_invoice") return "recurring";
  if (source === "document") return "invoice";
  return "other";
}

function addAmount(map, currency, amount) {
  const code = String(currency || "ZAR").trim().toUpperCase() || "ZAR";
  map.set(code, money((map.get(code) || 0) + money(amount)));
}

function volumeList(map) {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => (a.currency === "ZAR" ? -1 : b.currency === "ZAR" ? 1 : a.currency.localeCompare(b.currency)));
}

function averageList(volume, counts) {
  return volumeList(volume).map((row) => ({
    currency: row.currency,
    amount: counts.get(row.currency) ? money(row.amount / counts.get(row.currency)) : 0,
  }));
}

function snapshot(rows, includeAmounts, { trackProducts = true } = {}) {
  let successful = 0;
  let failed = 0;
  let pending = 0;
  let otherStatus = 0;
  const volume = new Map();
  const successCounts = new Map();
  const methods = new Map(PAYMENT_FINANCE_METHODS.map((m) => [m.key, { count: 0, volume: new Map(), success: 0, failed: 0 }]));
  const products = new Map(PAYMENT_FINANCE_PRODUCTS.map((p) => [p.key, { count: 0, volume: new Map() }]));
  const providers = new Map();

  for (const row of rows) {
    const count = Number(row?.count ?? 1) || 0;
    if (count <= 0) continue;
    const status = String(row?.status || "").trim().toLowerCase();
    const ok = SUCCESS.has(status);
    if (ok) successful += count;
    else if (FAILED.has(status)) failed += count;
    else if (PENDING.has(status)) pending += count;
    else otherStatus += count;

    const methodKey = classifyPaymentIntentMethod(row);
    const methodRow = methods.get(methodKey) || methods.get("other");
    methodRow.count += count;
    if (ok) methodRow.success += count;
    if (FAILED.has(status)) methodRow.failed += count;

    if (trackProducts) {
      const productRow = products.get(classifyPaymentIntentProduct(row));
      if (productRow) productRow.count += count;
      if (includeAmounts && ok && productRow) addAmount(productRow.volume, row.currency, row.amountSum);
    }

    const providerKey = String(row?.provider || "unknown").trim().toLowerCase() || "unknown";
    const providerRow = providers.get(providerKey) || { count: 0, success: 0, volume: new Map() };
    providerRow.count += count;
    if (ok) providerRow.success += count;
    providers.set(providerKey, providerRow);

    if (includeAmounts && ok) {
      addAmount(volume, row.currency, row.amountSum);
      addAmount(methodRow.volume, row.currency, row.amountSum);
      addAmount(providerRow.volume, row.currency, row.amountSum);
      const code = String(row.currency || "ZAR").trim().toUpperCase() || "ZAR";
      successCounts.set(code, (successCounts.get(code) || 0) + count);
    }
  }

  const total = successful + failed + pending + otherStatus;
  const pack = (defs, map) =>
    defs.map((def) => {
      const row = map.get(def.key);
      const out = {
        key: def.key,
        label: def.label,
        count: row.count,
        share: adoptionRate(row.count, total),
        successRate: successRate(row.success || 0, row.count),
      };
      if (includeAmounts) out.volume = volumeList(row.volume);
      return out;
    });

  const body = {
    total,
    successful,
    failed,
    pending,
    otherStatus,
    successRate: successRate(successful, total),
    failedRate: successRate(failed, total),
    methods: pack(PAYMENT_FINANCE_METHODS, methods),
    providers: [...providers.entries()]
      .map(([key, row]) => {
        const out = {
          key,
          label: paymentProviderLabel(key, key === "unknown" ? "Unknown" : "Payment provider"),
          count: row.count,
          share: adoptionRate(row.count, total),
          successRate: successRate(row.success, row.count),
        };
        if (includeAmounts) out.volume = volumeList(row.volume);
        return out;
      })
      .sort((a, b) => b.count - a.count),
  };
  if (trackProducts) body.products = pack(PAYMENT_FINANCE_PRODUCTS, products);
  if (includeAmounts) {
    body.volume = volumeList(volume);
    body.averageValue = averageList(volume, successCounts);
  }
  return body;
}

function inPeriod(row, from, to) {
  const t = new Date(row?.created_at).getTime();
  if (!Number.isFinite(t)) return !from && !to;
  if (from && t < from.getTime()) return false;
  if (to && t >= to.getTime()) return false;
  return true;
}

function trendFor(rows, now, includeAmounts) {
  const start = dayStart(now, 29);
  const days = [];
  for (let i = 0; i < 30; i += 1) {
    const at = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    days.push({ date: businessDateKey(at), count: 0, successful: 0, failed: 0, volume: new Map() });
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const row of rows) {
    const key = businessDateKey(row.created_at);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    const count = Number(row.count ?? 1) || 0;
    bucket.count += count;
    const status = String(row.status || "").toLowerCase();
    if (SUCCESS.has(status)) {
      bucket.successful += count;
      if (includeAmounts) addAmount(bucket.volume, row.currency, row.amountSum);
    } else if (FAILED.has(status)) bucket.failed += count;
  }
  return days.map((day) => {
    const out = { date: day.date, count: day.count, successful: day.successful, failed: day.failed };
    if (includeAmounts) out.volume = volumeList(day.volume);
    return out;
  });
}

/**
 * @param {Array<object>} rows intent facts or finance buckets
 * @param {{ includeAmounts?: boolean, now?: Date, customRange?: { from: Date, to: Date } | null }} [opts]
 */
export function buildPaymentIntentFinance(rows, opts = {}) {
  const includeAmounts = opts.includeAmounts === true;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const list = Array.isArray(rows) ? rows : [];
  const monthStart = startOfBusinessMonth(now);
  const previousStart = startOfBusinessMonth(new Date(monthStart.getTime() - 24 * 60 * 60 * 1000));
  const windows = {
    today: { from: dayStart(now, 0), to: null },
    "7d": { from: dayStart(now, 6), to: null },
    "30d": { from: dayStart(now, 29), to: null },
    month: { from: monthStart, to: null },
    previousMonth: { from: previousStart, to: monthStart },
    all: { from: null, to: null },
  };
  const periods = {};
  for (const key of PAYMENT_FINANCE_PERIODS) {
    const window = windows[key];
    const matched = list.filter((row) => inPeriod(row, window.from, window.to));
    const body = snapshot(matched, includeAmounts);
    body.pos = snapshot(
      matched.filter((row) => classifyPaymentIntentProduct(row) === "pos"),
      includeAmounts,
      { trackProducts: false }
    );
    periods[key] = body;
  }
  if (opts.customRange?.from && opts.customRange?.to) {
    const matched = list.filter((row) => inPeriod(row, opts.customRange.from, opts.customRange.to));
    const body = snapshot(matched, includeAmounts);
    body.pos = snapshot(
      matched.filter((row) => classifyPaymentIntentProduct(row) === "pos"),
      includeAmounts,
      { trackProducts: false }
    );
    periods.custom = body;
  }
  return {
    view: "platform",
    amountsVisible: includeAmounts,
    periods,
    trend: trendFor(list, now, includeAmounts),
  };
}
