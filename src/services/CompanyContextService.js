import { supabase } from "@/lib/supabaseClient";
import { Invoice } from "@/api/entities";
import { resolveActiveOrgIdForUser } from "@/api/auth/orgCache.js";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { buildCompanyAccessContext, normalizeCompanyRole, COMPANY_ROLES } from "@/lib/companyPermissions";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";

let cachedContext = null;
let cachedUserId = null;
let inflightLoad = null;
let inflightUserId = null;

/**
 * Load the active company (org) membership for the signed-in user.
 * @param {string} userId
 */
export async function loadCompanyAccessContext(userId) {
  if (!userId) return null;
  if (cachedContext && cachedUserId === userId) return cachedContext;
  if (inflightLoad && inflightUserId === userId) return inflightLoad;

  inflightUserId = userId;
  inflightLoad = loadCompanyAccessContextInner(userId).finally(() => {
    if (inflightUserId === userId) {
      inflightLoad = null;
      inflightUserId = null;
    }
  });
  return inflightLoad;
}

async function loadCompanyAccessContextInner(userId) {
  // Owners sign in to their company; invite-only members use the org they joined.
  let orgId = await resolveActiveOrgIdForUser(userId);
  if (!orgId) {
    orgId = await Invoice.ensureUserHasOrganization(userId);
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("org_id, role, job_function, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to load company membership"));
  }

  let membershipRole = membership?.role;
  if (!orgError && org?.owner_id === userId) {
    // Company signup / owner: full company admin experience (not invited-employee workspace).
    membershipRole = "owner";
  }

  const ctx = buildCompanyAccessContext({
    userId,
    companyId: orgId,
    membershipRole,
    jobFunction: membership?.job_function,
  });

  cachedContext = ctx;
  cachedUserId = userId;
  return ctx;
}

/** Clear cached membership (call on logout / org switch). */
export function clearCompanyAccessContextCache() {
  cachedContext = null;
  cachedUserId = null;
  inflightLoad = null;
  inflightUserId = null;
}

/**
 * List org members visible to the current role.
 * @param {import('@/lib/companyPermissions').CompanyAccessContext} ctx
 */
export async function listCompanyMembers(ctx) {
  if (!ctx?.companyId) return [];

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("user_id, role, job_function, created_at")
    .eq("org_id", ctx.companyId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to load team members"));
  }

  const rows = Array.isArray(memberships) ? memberships : [];
  if (!rows.length) return [];

  const userIds = rows.map((m) => m.user_id).filter(Boolean);
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profileErr) {
    throw new Error(getSupabaseErrorMessage(profileErr, "Failed to load profiles"));
  }

  const byId = new Map((profiles || []).map((p) => [p.id, p]));

  const members = rows.map((m) => {
    const p = byId.get(m.user_id);
    const memberCtx = buildCompanyAccessContext({
      userId: m.user_id,
      companyId: ctx.companyId,
      membershipRole: m.role,
      jobFunction: m.job_function,
    });
    return {
      user_id: m.user_id,
      role: m.role,
      job_function: memberCtx.jobFunction,
      company_role: memberCtx.companyRole,
      role_label: formatCompanyMemberRoleLabel(memberCtx.companyRole, memberCtx.jobFunction),
      full_name: p?.full_name || null,
      email: p?.email || null,
      label: p?.full_name?.trim() || p?.email?.trim() || "Team member",
    };
  });

  if (ctx.companyRole === "employee") {
    return members.filter((m) => m.user_id === ctx.userId);
  }

  return members;
}

/**
 * Resolve an org member's auth user id from their email (for payslip assignment).
 * @param {string} orgId
 * @param {string} email
 * @returns {Promise<string | null>}
 */
export async function resolveOrgMemberUserIdByEmail(orgId, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!orgId || !normalized) return null;

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .limit(5);

  if (profileErr || !profiles?.length) return null;

  const candidateIds = profiles
    .filter((p) => String(p.email || "").trim().toLowerCase() === normalized)
    .map((p) => p.id)
    .filter(Boolean);
  if (!candidateIds.length) return null;

  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .in("user_id", candidateIds)
    .limit(1)
    .maybeSingle();

  if (memErr || !membership?.user_id) return null;
  return membership.user_id;
}
