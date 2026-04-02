/**
 * Shared authorization for /api/admin/* — used by Express and Vercel serverless routes.
 */

export function dashboardRoleFromProfileRow(profile) {
  if (!profile || typeof profile !== "object") return "";
  const raw = profile.role ?? profile.user_role ?? "";
  return String(raw).trim().toLowerCase();
}

const INTERNAL_ADMIN_READ_ROLES = ["admin", "management", "support", "sales"];
const TEAM_INVITE_PROFILE_ROLES = ["admin", "management"];

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

  const requesterRole = user?.app_metadata?.role || user?.app_metadata?.claims?.role;
  if (requesterRole === "admin") return null;

  if (adminBypassAllowed(user?.email)) return null;

  if (!allowInternalTeam && !allowTeamManagement) {
    return { status: 403, body: { error: "Admin access required" } };
  }

  if (!user?.id) {
    return { status: 403, body: { error: "Admin access required" } };
  }

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
