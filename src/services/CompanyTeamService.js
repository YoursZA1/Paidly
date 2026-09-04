/**
 * Client service for company org team management (memberships.role + job_function).
 */
import { supabase } from "@/lib/supabaseClient";
import { Invoice } from "@/api/entities";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { normalizeCompanyRole, normalizeJobFunction, COMPANY_ROLES } from "@/lib/companyPermissions";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const INVITE_ROLES = [
  { value: COMPANY_ROLES.EMPLOYEE, label: "Employee" },
  { value: COMPANY_ROLES.MANAGER, label: "Manager" },
  { value: COMPANY_ROLES.ADMIN, label: "Admin" },
];

export { INVITE_ROLES };

const TEAM_INVITE_API_SETUP_HINT =
  "Start the API with `npm run server`, then set SUPABASE_SERVICE_ROLE_KEY in server/.env to the secret key from Supabase → Settings → API (sb_secret_… or legacy service_role JWT, not the anon/publishable key).";

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

  let detail =
    (typeof json?.error === "string" && json.error) ||
    (typeof json?.message === "string" && json.message) ||
    "";

  if (!detail && raw && !raw.trim().startsWith("{")) {
    detail = raw.trim().slice(0, 240);
  }

  if (
    res.status >= 500 &&
    (!detail || detail === "Internal Server Error" || /ECONNREFUSED|connect ECONNREFUSED/i.test(detail))
  ) {
    detail = `Company team API is unavailable. ${TEAM_INVITE_API_SETUP_HINT}`;
  }

  throw new Error(detail || res.statusText || fallbackMessage);
}

async function authHeaders() {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * Invite or attach an existing user to the company org with a role and job function.
 * @param {{ email: string, fullName?: string, role?: string, jobFunction?: string, source?: string, registerId?: string | null }} payload
 */
export async function listWorkforceEmployees() {
  const headers = await authHeaders();
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const res = await apiRequest(`${apiBase}/api/company/employees`, { method: "GET", headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load employees");
  return Array.isArray(json.data) ? json.data : [];
}

export async function createWorkforceEmployee({
  email,
  fullName,
  role = COMPANY_ROLES.EMPLOYEE,
  jobFunction = "general",
  department,
} = {}) {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) throw new Error("Email is required");
  const headers = await authHeaders();
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const res = await apiRequest(`${apiBase}/api/company/employees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: trimmed,
      full_name: fullName?.trim() || null,
      role: normalizeCompanyRole(role),
      job_function: normalizeJobFunction(jobFunction),
      department: department?.trim() || null,
    }),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not create employee");
}

export async function inviteCompanyMember({
  email,
  fullName,
  role = COMPANY_ROLES.EMPLOYEE,
  jobFunction = "general",
  source,
  registerId,
} = {}) {
  const trimmed = String(email || "").trim().toLowerCase();
  if (!trimmed) throw new Error("Email is required");

  const headers = await authHeaders();
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const payload = {
    email: trimmed,
    full_name: fullName?.trim() || null,
    role: normalizeCompanyRole(role),
    job_function: normalizeJobFunction(jobFunction),
  };
  if (source) payload.source = String(source).trim().toLowerCase();
  if (registerId) payload.register_id = registerId;
  const res = await apiRequest(`${apiBase}/api/company/invite`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Invite failed");
}

/**
 * Update a member's company role and optional job function (admin only).
 * @param {string} userId
 * @param {{ role?: string, jobFunction?: string }} updates
 */
export async function updateCompanyMember(userId, { role, jobFunction } = {}) {
  const headers = await authHeaders();
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const body = { user_id: userId };
  if (role != null) body.role = normalizeCompanyRole(role);
  if (jobFunction != null) body.job_function = normalizeJobFunction(jobFunction);

  const res = await apiRequest(`${apiBase}/api/company/role`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not update member");
}

/** @deprecated Use updateCompanyMember */
export async function updateCompanyMemberRole(userId, role) {
  return updateCompanyMember(userId, { role });
}

/** Direct membership update fallback (RLS-enforced) when API unavailable in dev. */
export async function updateCompanyMemberDirect(userId, { role, jobFunction }, orgId) {
  const patch = {};
  if (role != null) {
    const normalized = normalizeCompanyRole(role);
    patch.role = normalized === COMPANY_ROLES.ADMIN ? "admin" : normalized;
  }
  if (jobFunction != null) patch.job_function = normalizeJobFunction(jobFunction);
  if (!Object.keys(patch).length) return;

  const { error } = await supabase
    .from("memberships")
    .update(patch)
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Could not update member"));
  }
}

/** @deprecated Use updateCompanyMemberDirect */
export async function updateCompanyMemberRoleDirect(userId, role, orgId) {
  return updateCompanyMemberDirect(userId, { role }, orgId);
}

export async function resolveCurrentOrgId(userId) {
  return Invoice.ensureUserHasOrganization(userId);
}
