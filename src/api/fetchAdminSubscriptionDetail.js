/**
 * Admin Subscription Details — GET /api/admin/subscriptions?id=
 * Company · Owner · Plan · PayFast ID · Renew Date + History / Logs / Invoices
 */
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

function buildUrls(subscriptionId) {
  const q = `?id=${encodeURIComponent(String(subscriptionId))}`;
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

/**
 * @param {string} subscriptionId
 */
export async function fetchAdminSubscriptionDetail(subscriptionId) {
  const id = String(subscriptionId || "").trim();
  if (!id) throw new Error("subscription id required");

  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  let lastError = null;
  for (const url of buildUrls(id)) {
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
        formatHttpStatusMessage(res.status, "Failed to load subscription details");
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(lastError);
      }
      continue;
    }

    return res.json();
  }

  throw new Error(lastError || "Failed to load subscription details");
}
