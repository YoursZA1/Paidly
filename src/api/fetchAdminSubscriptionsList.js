/**
 * Admin Subscriptions list — GET /api/admin/subscriptions?limit=
 * Service-role list (JWT user cannot INSERT/UPDATE subscriptions; SELECT may also be GRANT-denied).
 */
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";
import { buildAdminSubscriptionsUrls } from "@/api/adminSubscriptionsUrls";

/**
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchAdminSubscriptionsList(opts = {}) {
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 500));
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  let lastError = null;
  for (const url of buildAdminSubscriptionsUrls(`?limit=${encodeURIComponent(String(limit))}`)) {
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
        formatHttpStatusMessage(res.status, "Failed to load subscriptions");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    const data = await res.json();
    const rows = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    return rows;
  }

  throw new Error(lastError || "Failed to load subscriptions");
}
