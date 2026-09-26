import { isEmailVerifiedUser } from "../../../shared/auth/emailVerification.js";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @returns {Promise<{ user: import("@supabase/auth-js").User } | { error: string, status: number }>}
 */
export async function requireBearerUser(req, supabaseAdmin) {
  const rawAuth = String(req.headers?.authorization || req.headers?.Authorization || "");
  const bearerMatch = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return { error: "Authentication required", status: 401 };
  }
  const { data, error } = await supabaseAdmin.auth.getUser(bearerMatch[1].trim());
  if (error || !data?.user?.id) {
    return { error: "Invalid or expired token", status: 401 };
  }
  if (!isEmailVerifiedUser(data.user)) {
    return { error: "Verify your email to continue.", status: 403 };
  }
  return { user: data.user };
}

/**
 * Cron / internal secret (CRON_SECRET or INTERNAL_BILLING_SECRET).
 * @param {import("http").IncomingMessage} req
 */
export function assertInternalBillingSecret(req) {
  const secret =
    String(process.env.INTERNAL_BILLING_SECRET || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  if (!secret || secret.length < 8) {
    return { ok: false, status: 503, error: "INTERNAL_BILLING_SECRET / CRON_SECRET is not configured" };
  }
  const auth = String(req.headers?.authorization || req.headers?.Authorization || "");
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

/**
 * Resolve product company_id (organizations.id) for the user.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 */
export async function resolveUserCompanyId(supabaseAdmin, userId) {
  const { data: owned } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id;

  const { data: membership } = await supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return membership?.org_id || null;
}

/**
 * Company for billing mutations (checkout, plan change, cancel) and whether the caller owns it.
 * Same company as resolveUserCompanyId. Billing & Invoices is org-owner only in the SPA
 * (RequireBusinessOwner); a member (employee, manager, HR, payroll) resolves to the employer's
 * company here and must not be able to start, change or cancel that company's agreement.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @returns {Promise<{ companyId: string | null, isOwner: boolean }>}
 */
export async function resolveBillingCompany(supabaseAdmin, userId) {
  const companyId = await resolveUserCompanyId(supabaseAdmin, userId);
  if (!companyId) return { companyId: null, isOwner: false };
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("owner_id")
    .eq("id", companyId)
    .maybeSingle();
  return { companyId, isOwner: Boolean(org?.owner_id) && String(org.owner_id) === String(userId) };
}
