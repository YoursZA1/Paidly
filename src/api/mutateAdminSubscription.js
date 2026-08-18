/**
 * Admin create/update subscriptions via service-role /api/admin/subscriptions.
 * Client JWT cannot INSERT/UPDATE public.subscriptions (GRANT revoked in billing v2).
 */
import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";
import { buildAdminSubscriptionsUrls } from "@/api/adminSubscriptionsUrls";

async function mutateAdminSubscription(method, body) {
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  let lastError = null;
  for (const url of buildAdminSubscriptionsUrls()) {
    let res;
    try {
      res = await apiRequest(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      lastError = e?.message || "Network error";
      continue;
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      lastError =
        apiErrorFieldToString(payload?.error) ||
        formatHttpStatusMessage(res.status, "Subscription request failed");
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(lastError);
      }
      continue;
    }

    return payload?.subscription || payload;
  }

  throw new Error(lastError || "Subscription request failed");
}

export async function createAdminSubscription(payload) {
  return mutateAdminSubscription("POST", payload);
}

export async function updateAdminSubscription(id, data) {
  const subId = String(id || "").trim();
  if (!subId) throw new Error("subscription id required");
  return mutateAdminSubscription("PATCH", { ...(data || {}), id: subId });
}
