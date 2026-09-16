/**
 * POS PIN client — Auth-backed membership only (not till access-pass).
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { posAuthHeaders } from "@/lib/pos/posAccessClient";

function apiBase() {
  return getBackendBaseUrl() || "";
}

async function authHeaders() {
  const headers = await posAuthHeaders({ includeJsonContentType: true });
  if (!headers.Authorization) throw new Error("Not authenticated");
  return headers;
}

function parseJsonError(res, raw, fallback) {
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = {};
    }
  }
  if (res.ok) return json;
  const detail =
    (typeof json?.error === "string" && json.error) ||
    (typeof json?.message === "string" && json.message) ||
    fallback;
  const err = new Error(detail);
  if (json?.code) err.code = json.code;
  throw err;
}

export async function getPosPinStatus() {
  const headers = await authHeaders();
  await getStableSession();
  const res = await apiRequest(`${apiBase()}/api/pos/pin`, { headers, credentials: "include" });
  const raw = await res.text().catch(() => "");
  return parseJsonError(res, raw, "Could not load POS PIN status");
}

/**
 * @param {{ pin: string, confirm_pin?: string, current_pin?: string }} payload
 */
export async function setPosPin(payload) {
  const headers = await authHeaders();
  await getStableSession();
  const res = await apiRequest(`${apiBase()}/api/pos/pin`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseJsonError(res, raw, "Could not save POS PIN");
}
