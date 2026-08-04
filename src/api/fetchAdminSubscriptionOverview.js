/**
 * Admin Subscription Overview — GET /api/admin/subscriptions?overview=1
 * Counts come from exact DB head counts (not a limited list slice).
 */
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

const EMPTY_OVERVIEW = Object.freeze({
  active: 0,
  pending: 0,
  expired: 0,
  cancelled: 0,
  trial: 0,
  pastDue: 0,
  bucketTotal: 0,
  total: 0,
  buckets: [
    { key: "active", label: "Active", count: 0 },
    { key: "pending", label: "Pending", count: 0 },
    { key: "expired", label: "Expired", count: 0 },
    { key: "cancelled", label: "Cancelled", count: 0 },
    { key: "trial", label: "Trial", count: 0 },
    { key: "pastDue", label: "Past Due", count: 0 },
  ],
});

function buildUrls() {
  const q = "?overview=1";
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(`/api/admin/subscriptions${q}`);
  const base = String(getAdminDataApiBase() || "").trim().replace(/\/$/, "");
  if (base) push(`${base}/api/admin/subscriptions${q}`);
  const envBase = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (envBase && envBase !== base) push(`${envBase}/api/admin/subscriptions${q}`);
  return out;
}

function normalizeOverview(raw) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_OVERVIEW };
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  const active = n(raw.active);
  const pending = n(raw.pending);
  const expired = n(raw.expired);
  const cancelled = n(raw.cancelled);
  const trial = n(raw.trial);
  const pastDue = n(raw.pastDue ?? raw.past_due);
  return {
    active,
    pending,
    expired,
    cancelled,
    trial,
    pastDue,
    bucketTotal: n(raw.bucketTotal),
    total: n(raw.total),
    buckets: [
      { key: "active", label: "Active", count: active },
      { key: "pending", label: "Pending", count: pending },
      { key: "expired", label: "Expired", count: expired },
      { key: "cancelled", label: "Cancelled", count: cancelled },
      { key: "trial", label: "Trial", count: trial },
      { key: "pastDue", label: "Past Due", count: pastDue },
    ],
  };
}

/**
 * @returns {Promise<{ overview: typeof EMPTY_OVERVIEW }>}
 */
export async function fetchAdminSubscriptionOverview() {
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
        formatHttpStatusMessage(res.status, "Failed to load subscription overview");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    const data = await res.json();
    return { overview: normalizeOverview(data?.overview || data) };
  }

  throw new Error(lastError || "Failed to load subscription overview");
}

export { EMPTY_OVERVIEW };
