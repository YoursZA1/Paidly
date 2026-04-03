/**
 * Shared authorization for /api/admin/* — used by Express and Vercel serverless routes.
 *
 * Aligns with `resolveUserRoleFromSessionAndProfile` (client): JWT may carry role in
 * `app_metadata`, `app_metadata.claims`, or `user_metadata` (e.g. invite payload).
 */

export function dashboardRoleFromProfileRow(profile) {
  if (!profile || typeof profile !== "object") return "";
  const raw = profile.role ?? profile.user_role ?? "";
  return String(raw).trim().toLowerCase();
}

const INTERNAL_ADMIN_READ_ROLES = ["admin", "management", "support", "sales"];
const TEAM_INVITE_PROFILE_ROLES = ["admin", "management"];
const AFFILIATE_BUNDLE_READ_ROLES = ["admin", "management", "support"];
const AFFILIATE_MUTATION_ROLES = ["admin", "management"];

/**
 * First staff role token found on the JWT user (same sources the UI considers).
 * @param {import("@supabase/auth-js").User | null | undefined} user
 * @returns {string} normalized role or ""
 */
export function jwtKnownStaffRole(user) {
  if (!user || typeof user !== "object") return "";
  const candidates = [
    user.app_metadata?.role,
    user.app_metadata?.claims?.role,
    user.user_metadata?.role,
  ];
  for (const c of candidates) {
    const r = String(c ?? "")
      .trim()
      .toLowerCase();
    if (INTERNAL_ADMIN_READ_ROLES.includes(r)) return r;
  }
  return "";
}

function adminBypassAllowed(email) {
  const adminBypassEnv = String(process.env.ADMIN_BYPASS_AUTH || "").toLowerCase().trim();
  const adminBypassEnabled = ["true", "1", "yes", "on"].includes(adminBypassEnv);
  const adminBypassEmails = (process.env.ADMIN_BYPASS_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const e = (email || "").toLowerCase();
  return adminBypassEnabled && !!e && adminBypassEmails.includes(e);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {import("@supabase/auth-js").User} user
 * @param {{ allowInternalTeam?: boolean, allowTeamManagement?: boolean }} opts
 * @returns {Promise<null | { status: number, body: { error: string } }>}
 */
export async function assertCallerForAdminRoute(supabaseAdmin, user, opts = {}) {
  const allowInternalTeam = opts.allowInternalTeam === true;
  const allowTeamManagement = opts.allowTeamManagement === true;

  const jwtRole = jwtKnownStaffRole(user);

  if (jwtRole === "admin") return null;
  if (adminBypassAllowed(user?.email)) return null;

  // Strict admin-only routes (e.g. clean-orphaned-users): JWT or profile must be admin.
  if (!allowInternalTeam && !allowTeamManagement) {
    if (!user?.id) {
      return { status: 403, body: { error: "Admin access required" } };
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, user_role")
      .eq("id", user.id)
      .maybeSingle();
    const pr = dashboardRoleFromProfileRow(profile);
    if (pr === "admin") return null;
    return { status: 403, body: { error: "Admin access required" } };
  }

  if (!user?.id) {
    return { status: 403, body: { error: "Admin access required" } };
  }

  if (allowInternalTeam && jwtRole && INTERNAL_ADMIN_READ_ROLES.includes(jwtRole)) return null;
  if (allowTeamManagement && jwtRole && TEAM_INVITE_PROFILE_ROLES.includes(jwtRole)) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, user_role")
    .eq("id", user.id)
    .maybeSingle();

  const pr = dashboardRoleFromProfileRow(profile);
  if (allowInternalTeam && INTERNAL_ADMIN_READ_ROLES.includes(pr)) return null;
  if (allowTeamManagement && TEAM_INVITE_PROFILE_ROLES.includes(pr)) return null;

  return { status: 403, body: { error: "Admin access required" } };
}

/**
 * GET affiliate admin bundle (/api/affiliates, /api/admin/affiliates): admin | management | support.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {import("@supabase/auth-js").User} user
 */
export async function canReadAffiliateAdminBundle(supabaseAdmin, user) {
  const j = jwtKnownStaffRole(user);
  if (AFFILIATE_BUNDLE_READ_ROLES.includes(j)) return true;
  if (!user?.id) return false;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, user_role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return false;
  const pr = dashboardRoleFromProfileRow(data);
  return AFFILIATE_BUNDLE_READ_ROLES.includes(pr);
}

/**
 * Approve / decline affiliate application (management + admin).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {import("@supabase/auth-js").User} user
 */
export async function canMutateAffiliateApplication(supabaseAdmin, user) {
  const j = jwtKnownStaffRole(user);
  if (AFFILIATE_MUTATION_ROLES.includes(j)) return true;
  if (!user?.id) return false;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, user_role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return false;
  const pr = dashboardRoleFromProfileRow(data);
  return AFFILIATE_MUTATION_ROLES.includes(pr);
}
