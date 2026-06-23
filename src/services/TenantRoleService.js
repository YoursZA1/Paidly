import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

export const INVITE_TOKEN_KEY = "paidly_company_invite_token";

/**
 * @typedef {{
 *   ok: boolean,
 *   saasRole: 'platform_admin' | 'company_admin' | 'employee' | null,
 *   companyId: string | null,
 *   homeRoute: string,
 *   isEmployeeDashboard: boolean,
 *   onboarding: object | null,
 *   error?: string,
 * }} TenantContext
 */

let cached = null;
let cachedUserId = null;
let inflightLoad = null;
let inflightUserId = null;

function normalizeTenantContext(raw) {
  if (!raw || raw.ok === false) {
    return {
      ok: false,
      saasRole: null,
      companyId: null,
      homeRoute: "/Dashboard",
      isEmployeeDashboard: false,
      onboarding: null,
      error: raw?.error || "Could not load tenant role",
    };
  }

  const role = String(raw.saas_role || "").trim();
  const saasRole =
    role === "platform_admin" || role === "company_admin" || role === "employee" ? role : "company_admin";

  return {
    ok: true,
    saasRole,
    companyId: raw.company_id || null,
    homeRoute: raw.home_route || "/Dashboard",
    isEmployeeDashboard: raw.employee_dashboard === true,
    onboarding: raw.onboarding || null,
  };
}

export async function loadTenantContext(userId) {
  if (!userId) return normalizeTenantContext({ ok: false, error: "missing_user" });
  if (cached && cachedUserId === userId) return cached;
  if (inflightLoad && inflightUserId === userId) return inflightLoad;

  inflightUserId = userId;
  inflightLoad = loadTenantContextInner(userId).finally(() => {
    if (inflightUserId === userId) {
      inflightLoad = null;
      inflightUserId = null;
    }
  });
  return inflightLoad;
}

async function loadTenantContextInner(userId) {
  const { data, error } = await supabase.rpc("get_my_tenant_context");
  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load tenant context"));

  cached = normalizeTenantContext(data);
  cachedUserId = userId;
  return cached;
}

export function clearTenantContextCache() {
  cached = null;
  cachedUserId = null;
  inflightLoad = null;
  inflightUserId = null;
}

export function storePendingInviteToken(token) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.sessionStorage.setItem(INVITE_TOKEN_KEY, String(token).trim());
  } catch {
    /* ignore */
  }
}

export function peekPendingInviteToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(INVITE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInviteToken() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(INVITE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function validateInviteToken(token) {
  const { data, error } = await supabase.rpc("validate_company_invite_token", { p_token: token });
  if (error) throw new Error(getSupabaseErrorMessage(error, "Could not validate invite"));
  return data;
}

/** After signup/sign-in: bind pending company_invites token to the authenticated user. */
export async function acceptPendingInviteToken(token) {
  const { data, error } = await supabase.rpc("accept_company_invite_token", { p_token: token });
  if (error) throw new Error(getSupabaseErrorMessage(error, "Could not accept invite"));
  if (!data?.ok) throw new Error(data?.error || "Invite could not be accepted");
  clearPendingInviteToken();
  clearTenantContextCache();
  return data;
}

export async function tryAcceptStoredInviteToken() {
  const token = peekPendingInviteToken();
  if (!token) return null;
  try {
    return await acceptPendingInviteToken(token);
  } catch {
    return null;
  }
}
