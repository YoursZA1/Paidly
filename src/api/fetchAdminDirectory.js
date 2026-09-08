import { apiErrorFieldToString, formatHttpStatusMessage } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";
import { buildAdminApiUrls } from "@/api/adminApiUrls";

export async function fetchAdminDirectory(kind, limit = 50) {
  const token = await getSessionAccessTokenOrHandleUnauthorized();
  if (!token) throw new Error("Sign in required");

  const q = `kind=${encodeURIComponent(String(kind || ""))}&limit=${encodeURIComponent(String(limit))}`;
  let lastError = null;
  for (const url of buildAdminApiUrls("directory", q)) {
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
        formatHttpStatusMessage(res.status, "Failed to load directory");
      if (res.status === 401 || res.status === 403) throw new Error(lastError);
      continue;
    }

    return await res.json();
  }

  throw new Error(lastError || "Failed to load directory");
}
