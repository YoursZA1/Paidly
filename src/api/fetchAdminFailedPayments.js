/**
 * Admin Failed Payments — GET /api/admin/failed-payments
 * Columns: Company | Date | Reason | Retry Count | Amount
 */
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

function buildUrls(limit) {
  const q = `?limit=${encodeURIComponent(String(limit))}`;
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(`/api/admin/failed-payments${q}`);
  const base = String(getAdminDataApiBase() || "").trim().replace(/\/$/, "");
  if (base) push(`${base}/api/admin/failed-payments${q}`);
  const envBase = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (envBase && envBase !== base) push(`${envBase}/api/admin/failed-payments${q}`);
  return out;
}

function normalizeRow(r) {
  if (!r || typeof r !== "object") return null;
  return {
    id: r.id || null,
    company: String(r.company || r.companyName || "Unknown company"),
    companyName: r.companyName || null,
    email: r.email || null,
    companyId: r.companyId || r.company_id || null,
    date: r.date || r.transaction_date || r.createdAt || r.created_at || null,
    reason: String(r.reason || "Payment failed"),
    retryCount: Number(r.retryCount ?? r.retry_count ?? 0) || 0,
    amount: Number(r.amount || 0) || 0,
    currency: String(r.currency || "ZAR").toUpperCase(),
    subscriptionId: r.subscriptionId || r.subscription_id || null,
  };
}

/**
 * @param {number} [limit]
 * @returns {Promise<{ failedPayments: object[], count: number }>}
 */
export async function fetchAdminFailedPayments(limit = 50) {
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  let lastError = null;
  for (const url of buildUrls(limit)) {
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
        formatHttpStatusMessage(res.status, "Failed to load failed payments");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    const data = await res.json();
    const rows = (data?.failedPayments || []).map(normalizeRow).filter(Boolean);
    return { failedPayments: rows, count: data?.count ?? rows.length };
  }

  throw new Error(lastError || "Failed to load failed payments");
}
