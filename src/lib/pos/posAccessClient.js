import { getBackendBaseUrl } from "@/api/backendClient";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { POS_ACCESS_BEARER_PREFIX } from "@shared/posStaffInvite.js";
import { posInvitePublicErrorMessage } from "@shared/companyInviteMessages.js";

export { greetingForHour, firstNameFromEmployee } from "@/lib/pos/posAccessCopy";

const STORAGE_KEY = "paidly_pos_access_token";
const PROFILE_KEY = "paidly_pos_access_profile";

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

export function getPosAccessToken() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return String(sessionStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setPosAccessToken(token) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const value = String(token || "").trim();
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPosAccessToken() {
  setPosAccessToken("");
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

export function getPosAccessProfile() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function rememberPosAccessProfile(access) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        name: access?.employee?.name || "",
        email: access?.employee?.email || "",
        orgName: access?.org?.name || "",
      })
    );
  } catch {
    /* ignore */
  }
}

export async function posAuthHeaders({ includeJsonContentType = true } = {}) {
  const headers = {};
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  try {
    const session = await getStableSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
      return headers;
    }
  } catch {
    /* POS access-pass may still work */
  }
  const posToken = getPosAccessToken();
  if (posToken) headers.Authorization = `Bearer ${POS_ACCESS_BEARER_PREFIX}${posToken}`;
  return headers;
}

export async function posApiFetch(path, init = {}) {
  const { headers: extraHeaders, ...rest } = init;
  const headers = {
    ...(await posAuthHeaders({ includeJsonContentType: Boolean(rest.body) })),
    ...(extraHeaders || {}),
  };
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
  return fetch(url, {
    credentials: "include",
    ...rest,
    headers,
  });
}

function parseJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Consume a POS invite into a scoped POS access session. Not a Paidly signup.
 * @param {string} token
 */
export async function activatePosInvite(token) {
  const code = String(token || "").trim();
  if (!code) throw new Error(posInvitePublicErrorMessage("missing_token"));
  const res = await posApiFetch("/api/pos/invite-activate", {
    method: "POST",
    body: JSON.stringify({ token: code }),
  });
  const raw = await res.text().catch(() => "");
  const json = parseJson(raw);
  if (!res.ok || json.ok === false) {
    const reason = json.error || json.message || "invalid";
    throw new Error(json.message || posInvitePublicErrorMessage(reason, json.status));
  }
  if (json.access_token) setPosAccessToken(json.access_token);
  rememberPosAccessProfile(json);
  return json;
}

export async function fetchPosAccess() {
  const res = await posApiFetch("/api/pos/access");
  const raw = await res.text().catch(() => "");
  const json = parseJson(raw);
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok || json.ok === false) return null;
  rememberPosAccessProfile(json);
  return json;
}

export async function endPosAccess() {
  try {
    await posApiFetch("/api/pos/access-end", { method: "POST" });
  } catch {
    /* still clear local token */
  }
  clearPosAccessToken();
}
