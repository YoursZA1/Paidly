/**
 * Company invite management API client.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";

async function authHeaders() {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function parseApiJsonError(res, raw, fallbackMessage) {
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
    res.statusText ||
    fallbackMessage;
  throw new Error(detail);
}

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

/**
 * @param {{ status?: string }} [opts]
 */
export async function listCompanyInvites(opts = {}) {
  const headers = await authHeaders();
  const qs = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
  const res = await apiRequest(`${apiBase()}/api/company/invites${qs}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load invites");
  return Array.isArray(json.invites) ? json.invites : [];
}

export async function revokeCompanyInvite(inviteId) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/company/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
    headers,
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not revoke invite");
}

export async function resendCompanyInvite(inviteId) {
  const headers = await authHeaders();
  const res = await apiRequest(
    `${apiBase()}/api/company/invites/${encodeURIComponent(inviteId)}/resend`,
    { method: "POST", headers }
  );
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not resend invite");
}

/**
 * Platform admin: invite a company admin or employee to a new or existing company.
 * @param {{
 *   email: string,
 *   fullName?: string,
 *   companyId?: string,
 *   companyName?: string,
 *   role?: string,
 * }} payload
 */
export async function validatePublicInviteToken(token) {
  const code = String(token || "").trim();
  if (!code) throw new Error("Enter your till invite code");
  const res = await fetch(
    `${apiBase()}/api/company/invite/validate?token=${encodeURIComponent(code)}`
  );
  const raw = await res.text().catch(() => "");
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (res.status === 429) {
    throw new Error(json.error || "Too many attempts. Try again later.");
  }
  if (!res.ok || json.ok === false) {
    const reason = json.error || "invalid";
    const messages = {
      not_found: "This invitation code is invalid or has already been used.",
      expired: "This invitation has expired. Ask your administrator to send a new invite.",
      not_pending: "This invitation is no longer active.",
      revoked: "This invitation was revoked.",
      missing_token: "Enter your till invite code.",
    };
    throw new Error(messages[reason] || json.error || "This invitation is not valid.");
  }
  return json;
}

/**
 * Platform admin: invite a company admin or employee to a new or existing company.
 * @param {{
 *   email: string,
 *   fullName?: string,
 *   companyId?: string,
 *   companyName?: string,
 *   role?: string,
 * }} payload
 */
export async function platformInviteCompanyAdmin(payload) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/admin/invite-company`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: String(payload.email || "").trim().toLowerCase(),
      full_name: payload.fullName?.trim() || null,
      company_id: payload.companyId || null,
      company_name: payload.companyName?.trim() || null,
      role: payload.role || "admin",
    }),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Platform invite failed");
}
