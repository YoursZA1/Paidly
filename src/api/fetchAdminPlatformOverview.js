import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";
import { buildAdminApiUrls } from "@/api/adminApiUrls";

export async function fetchAdminPlatformOverview(period = "monthly") {
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  const q = `period=${encodeURIComponent(String(period || "monthly"))}`;
  let lastError = null;
  for (const url of buildAdminApiUrls("overview", q)) {
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
        formatHttpStatusMessage(res.status, "Failed to load admin overview");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    const data = await res.json();
    return data?.overview || data;
  }

  throw new Error(lastError || "Failed to load admin overview");
}
