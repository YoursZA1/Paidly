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
