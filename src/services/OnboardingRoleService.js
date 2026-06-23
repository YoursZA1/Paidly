import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

/**
 * @typedef {{
 *   ok: boolean,
 *   userId: string | null,
 *   orgId: string | null,
 *   companyRole: string | null,
 *   onboardingForm: 'admin' | 'member',
 *   isOrgOwner: boolean,
 *   assignedBy: string | null,
 *   error?: string,
 * }} OnboardingContext
 */

let cachedContext = null;
let cachedUserId = null;

function normalizeOnboardingContext(raw) {
  if (!raw || raw.ok === false) {
    return {
      ok: false,
      userId: null,
      orgId: null,
      companyRole: null,
      onboardingForm: "admin",
      isOrgOwner: false,
      assignedBy: null,
      error: raw?.error || "Could not load onboarding role",
    };
  }

  const form = String(raw.onboarding_form || "").toLowerCase() === "member" ? "member" : "admin";

  return {
    ok: true,
    userId: raw.user_id || null,
    orgId: raw.org_id || null,
    companyRole: raw.company_role || null,
    onboardingForm: form,
    isOrgOwner: raw.is_org_owner === true,
    assignedBy: raw.assigned_by || null,
  };
}

/**
 * Load onboarding form variant from Supabase user_company_roles (post-signup trigger).
 * @param {string} userId
 * @returns {Promise<OnboardingContext>}
 */
export async function loadOnboardingContext(userId) {
  if (!userId) {
    return normalizeOnboardingContext({ ok: false, error: "missing_user" });
  }

  if (cachedContext && cachedUserId === userId) {
    return cachedContext;
  }

  const { data, error } = await supabase.rpc("get_my_onboarding_context");
  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to load onboarding role"));
  }

  const ctx = normalizeOnboardingContext(data);
  cachedUserId = userId;
  cachedContext = ctx;
  return ctx;
}

export function clearOnboardingContextCache() {
  cachedContext = null;
  cachedUserId = null;
}

/** Extended company setup (owner signup) vs standard profile setup (invited members). */
export function isAdminOnboardingForm(ctx) {
  return ctx?.onboardingForm === "admin";
}
