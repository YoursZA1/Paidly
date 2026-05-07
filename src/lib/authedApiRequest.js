import { apiRequest } from "@/utils/apiRequest";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

export async function authedApiRequest(url, init = {}, options = {}) {
  const token = await getSessionAccessTokenOrHandleUnauthorized(options.reason || "missing_access_token");
  if (!token) {
    throw new Error(options.unauthorizedMessage || "Not authenticated");
  }
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return apiRequest(url, {
    ...(init || {}),
    headers,
  });
}
