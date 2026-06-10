/**
 * Server-side company (org) authorization — mirrors client companyPermissions.js.
 * Use on /api routes that return company-scoped data.
 */

export const COMPANY_ROLES = Object.freeze({
  EMPLOYEE: "employee",
  MANAGER: "manager",
  ADMIN: "admin",
});

/** Keep in sync with src/lib/companyPermissions.js */
export const PERMISSIONS = Object.freeze({
  VIEW_OWN_PROFILE: "view_own_profile",
  VIEW_OWN_PAYSLIPS: "view_own_payslips",
  VIEW_OWN_LEAVE: "view_own_leave",
  VIEW_OWN_DOCUMENTS: "view_own_documents",
  VIEW_NOTIFICATIONS: "view_notifications",
  VIEW_ANNOUNCEMENTS: "view_announcements",
  VIEW_TEAM_MEMBERS: "view_team_members",
  VIEW_TEAM_LEAVE: "view_team_leave",
  VIEW_TEAM_DOCUMENTS: "view_team_documents",
  VIEW_TEAM_PAYROLL_SUMMARY: "view_team_payroll_summary",
  MANAGE_EMPLOYEES: "manage_employees",
  MANAGE_PAYROLL: "manage_payroll",
  MANAGE_LEAVE: "manage_leave",
  MANAGE_COMPANY_DOCUMENTS: "manage_company_documents",
  VIEW_COMPANY_REPORTS: "view_company_reports",
  MANAGE_COMPANY_SETTINGS: "manage_company_settings",
  VIEW_AUDIT_LOGS: "view_audit_logs",
  MANAGE_DEPARTMENTS: "manage_departments",
  APPROVE_LEAVE: "approve_leave",
});

/** @type {Record<string, readonly string[]>} */
const ROLE_PERMISSIONS = Object.freeze({
  employee: Object.freeze([
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_OWN_PAYSLIPS,
    PERMISSIONS.VIEW_OWN_LEAVE,
    PERMISSIONS.VIEW_OWN_DOCUMENTS,
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.VIEW_ANNOUNCEMENTS,
  ]),
  manager: Object.freeze([
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_OWN_PAYSLIPS,
    PERMISSIONS.VIEW_OWN_LEAVE,
    PERMISSIONS.VIEW_OWN_DOCUMENTS,
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.VIEW_ANNOUNCEMENTS,
    PERMISSIONS.VIEW_TEAM_MEMBERS,
    PERMISSIONS.VIEW_TEAM_LEAVE,
    PERMISSIONS.VIEW_TEAM_DOCUMENTS,
    PERMISSIONS.VIEW_TEAM_PAYROLL_SUMMARY,
    PERMISSIONS.APPROVE_LEAVE,
  ]),
  admin: Object.freeze([
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_OWN_PAYSLIPS,
    PERMISSIONS.VIEW_OWN_LEAVE,
    PERMISSIONS.VIEW_OWN_DOCUMENTS,
    PERMISSIONS.VIEW_NOTIFICATIONS,
    PERMISSIONS.VIEW_ANNOUNCEMENTS,
    PERMISSIONS.VIEW_TEAM_MEMBERS,
    PERMISSIONS.VIEW_TEAM_LEAVE,
    PERMISSIONS.VIEW_TEAM_DOCUMENTS,
    PERMISSIONS.VIEW_TEAM_PAYROLL_SUMMARY,
    PERMISSIONS.MANAGE_EMPLOYEES,
    PERMISSIONS.MANAGE_PAYROLL,
    PERMISSIONS.MANAGE_LEAVE,
    PERMISSIONS.MANAGE_COMPANY_DOCUMENTS,
    PERMISSIONS.VIEW_COMPANY_REPORTS,
    PERMISSIONS.MANAGE_COMPANY_SETTINGS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.MANAGE_DEPARTMENTS,
    PERMISSIONS.APPROVE_LEAVE,
  ]),
});

export function normalizeCompanyRole(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "owner" || key === "admin") return COMPANY_ROLES.ADMIN;
  if (key === "manager") return COMPANY_ROLES.MANAGER;
  return COMPANY_ROLES.EMPLOYEE;
}

const KNOWN_JOB_FUNCTIONS = new Set([
  "general",
  "sales",
  "hr",
  "finance",
  "operations",
  "support",
  "marketing",
  "it",
]);

export function normalizeJobFunction(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (key === "human_resources") return "hr";
  return KNOWN_JOB_FUNCTIONS.has(key) ? key : "general";
}

export function companyRoleHasPermission(role, permission) {
  const normalized = normalizeCompanyRole(role);
  const set = new Set(ROLE_PERMISSIONS[normalized] || []);
  return set.has(permission);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 */
async function resolveActiveOrgIdForUser(supabaseAdmin, userId) {
  const { data: ownedOrg, error: ownedErr } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedErr) throw ownedErr;
  if (ownedOrg?.id) return ownedOrg.id;

  const { data: invitedMembership, error: memErr } = await supabaseAdmin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw memErr;
  return invitedMembership?.org_id ?? null;
}

async function fetchMembershipForOrg(supabaseAdmin, userId, orgId) {
  const withJobFunction = await supabaseAdmin
    .from("memberships")
    .select("org_id, role, job_function, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (withJobFunction.error && /job_function/i.test(withJobFunction.error.message || "")) {
    const withoutJobFunction = await supabaseAdmin
      .from("memberships")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();
    return withoutJobFunction;
  }
  return withJobFunction;
}

export async function loadCompanyMembership(supabaseAdmin, userId) {
  const orgId = await resolveActiveOrgIdForUser(supabaseAdmin, userId);
  if (!orgId) return null;

  const { data: membership, error } = await fetchMembershipForOrg(supabaseAdmin, userId, orgId);
  if (error) throw error;

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw orgError;

  let membershipRole = membership?.role;
  if (org?.owner_id === userId) {
    membershipRole = "owner";
  } else if (!membershipRole) {
    return null;
  }

  return {
    userId,
    companyId: orgId,
    orgId,
    companyRole: normalizeCompanyRole(membershipRole),
    membershipRole,
    jobFunction: normalizeJobFunction(membership?.job_function),
  };
}

/**
 * Express/Vercel middleware factory.
 * @param {string} permission
 */
export function requireCompanyPermission(permission) {
  return async function companyPermissionMiddleware(req, res, next) {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const supabaseAdmin = req.supabaseAdmin;
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Server misconfigured" });
      }
      const membership = await loadCompanyMembership(supabaseAdmin, user.id);
      if (!membership) {
        return res.status(403).json({ error: "No company membership" });
      }
      if (!companyRoleHasPermission(membership.companyRole, permission)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.company = membership;
      return next();
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Authorization failed" });
    }
  };
}

/**
 * Validate record belongs to user's company and optional employee ownership.
 * @param {{ companyId: string, userId: string, companyRole: string }} membership
 * @param {{ org_id?: string, company_id?: string, user_id?: string, created_by?: string, assigned_user_id?: string, employee_user_id?: string }} record
 */
export function assertCompanyRecordAccess(membership, record, { selfOnly = false } = {}) {
  const recordOrg = record.org_id || record.company_id;
  if (!recordOrg || recordOrg !== membership.companyId) {
    const err = new Error("Record not in your company");
    err.status = 403;
    throw err;
  }
  if (membership.companyRole === COMPANY_ROLES.ADMIN || membership.companyRole === COMPANY_ROLES.MANAGER) {
    return true;
  }
  if (!selfOnly) return true;
  const uid = membership.userId;
  const owned =
    record.user_id === uid ||
    record.created_by === uid ||
    record.assigned_user_id === uid ||
    record.employee_user_id === uid;
  if (!owned) {
    const err = new Error("Not authorized for this record");
    err.status = 403;
    throw err;
  }
  return true;
}
