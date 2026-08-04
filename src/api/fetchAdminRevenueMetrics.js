/**
 * Admin Revenue metrics — GET /api/admin/revenue?metrics=1
 * MRR/ARR from active subscriptions; cash/failed/refunds from payment_history.
 */
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

const EMPTY_METRICS = Object.freeze({
  currency: "ZAR",
  mrr: 0,
  arr: 0,
  todaysRevenue: 0,
  monthlyRevenue: 0,
  failedRevenue: 0,
  refunds: 0,
  averageRevenuePerUser: 0,
  arpu: 0,
  activeSubscriptionCount: 0,
  payingUserCount: 0,
  metrics: [
    { key: "mrr", label: "MRR", amount: 0 },
    { key: "arr", label: "ARR", amount: 0 },
    { key: "todaysRevenue", label: "Today's Revenue", amount: 0 },
    { key: "monthlyRevenue", label: "Monthly Revenue", amount: 0 },
    { key: "failedRevenue", label: "Failed Revenue", amount: 0 },
    { key: "refunds", label: "Refunds", amount: 0 },
    { key: "averageRevenuePerUser", label: "Average Revenue Per User", amount: 0 },
  ],
});

function buildUrls() {
  const q = "?metrics=1";
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(`/api/admin/revenue${q}`);
  const base = String(getAdminDataApiBase() || "").trim().replace(/\/$/, "");
  if (base) push(`${base}/api/admin/revenue${q}`);
  const envBase = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (envBase && envBase !== base) push(`${envBase}/api/admin/revenue${q}`);
  return out;
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeMetrics(raw) {
  const src = raw?.metrics && typeof raw.metrics === "object" && !Array.isArray(raw.metrics)
    ? raw.metrics
    : raw;
  if (!src || typeof src !== "object") return { ...EMPTY_METRICS };

  const mrr = money(src.mrr);
  const arr = money(src.arr);
  const todaysRevenue = money(src.todaysRevenue);
  const monthlyRevenue = money(src.monthlyRevenue);
  const failedRevenue = money(src.failedRevenue);
  const refunds = money(src.refunds);
  const averageRevenuePerUser = money(src.averageRevenuePerUser ?? src.arpu);

  return {
    currency: String(src.currency || "ZAR").toUpperCase(),
    mrr,
    arr,
    todaysRevenue,
    monthlyRevenue,
    failedRevenue,
    refunds,
    averageRevenuePerUser,
    arpu: averageRevenuePerUser,
    activeSubscriptionCount: Number(src.activeSubscriptionCount) || 0,
    payingUserCount: Number(src.payingUserCount) || 0,
    period: src.period || null,
    metrics: [
      { key: "mrr", label: "MRR", amount: mrr },
      { key: "arr", label: "ARR", amount: arr },
      { key: "todaysRevenue", label: "Today's Revenue", amount: todaysRevenue },
      { key: "monthlyRevenue", label: "Monthly Revenue", amount: monthlyRevenue },
      { key: "failedRevenue", label: "Failed Revenue", amount: failedRevenue },
      { key: "refunds", label: "Refunds", amount: refunds },
      {
        key: "averageRevenuePerUser",
        label: "Average Revenue Per User",
        amount: averageRevenuePerUser,
      },
    ],
  };
}

export async function fetchAdminRevenueMetrics() {
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  let lastError = null;
  for (const url of buildUrls()) {
    let res;
    try {
      res = await apiRequest(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        credentials: "include",
      });
    } catch (e) {
      lastError = e?.message || "Network error";
      continue;
    }

    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      lastError =
        apiErrorFieldToString(payload?.error) ||
        formatHttpStatusMessage(res.status, "Failed to load revenue metrics");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    const data = await res.json();
    return { metrics: normalizeMetrics(data) };
  }

  throw new Error(lastError || "Failed to load revenue metrics");
}

export { EMPTY_METRICS };
