import { getBackendBaseUrl } from "@/api/backendClient";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { POS_ACCESS_BEARER_PREFIX } from "@shared/posStaffInvite.js";
import { posInvitePublicErrorMessage } from "@shared/companyInviteMessages.js";
import { withPortalHeader } from "@/lib/workforcePortal/portalState.js";

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
    headers: withPortalHeader(url, headers),
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

// ── Till link + operator code ─────────────────────────────────────────────────────

const TILL_KEY = "paidly_pos_device_till";

/** The till this device last opened (a register id — not a secret; it only shows the till name). */
export function getRememberedTillId() {
  if (typeof localStorage === "undefined") return "";
  try {
    return String(localStorage.getItem(TILL_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function rememberTillId(tillId) {
  if (typeof localStorage === "undefined") return;
  try {
    if (tillId) localStorage.setItem(TILL_KEY, String(tillId));
    else localStorage.removeItem(TILL_KEY);
  } catch {
    /* private mode */
  }
}

/** Public till name + business for the code screen. Returns null when the link is not active. */
export async function fetchTillInfo(tillId) {
  if (!tillId) return null;
  const res = await posApiFetch(`/api/pos/till-info?id=${encodeURIComponent(tillId)}`);
  const raw = await res.text().catch(() => "");
  const json = parseJson(raw);
  if (!res.ok || !json.ok) return null;
  return json;
}

/**
 * Verify an operator code for this till. Opens a scoped till session (never a Paidly login).
 * @returns the POS access view (same shape as /api/pos/access)
 */
export async function unlockTillWithCode(tillId, code) {
  const res = await posApiFetch("/api/pos/code-unlock", {
    method: "POST",
    body: JSON.stringify({ till_id: tillId, code }),
  });
  const raw = await res.text().catch(() => "");
  const json = parseJson(raw);
  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || "That code is not valid for this till.");
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  if (json.access_token) setPosAccessToken(json.access_token);
  rememberPosAccessProfile(json);
  rememberTillId(tillId);
  return json;
}
