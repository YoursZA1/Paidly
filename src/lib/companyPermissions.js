/**
 * Company (org) permission system — permissions-based RBAC for tenant dashboards.
 *
 * Platform staff roles (profiles.role: admin/management/sales/support) are separate;
 * use staffDashboard.js for /admin-v2. This module covers org membership roles only.
 *
 * company_id in product copy maps to org_id in the database.
 */

/** @typedef {'employee'|'manager'|'admin'} CompanyRole */

export const COMPANY_ROLES = Object.freeze({
  EMPLOYEE: "employee",
  MANAGER: "manager",
  ADMIN: "admin",
});

/** Fine-grained permissions — add new permissions without new roles. */
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

/** @type {Record<CompanyRole, readonly string[]>} */
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

/**
 * @param {unknown} raw
 * @returns {CompanyRole}
 */
export function normalizeCompanyRole(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (key === "owner" || key === "admin") return COMPANY_ROLES.ADMIN;
  if (key === "manager") return COMPANY_ROLES.MANAGER;
  return COMPANY_ROLES.EMPLOYEE;
}

/**
 * @param {CompanyRole | string | null | undefined} role
 * @returns {Set<string>}
 */
export function permissionsForCompanyRole(role) {
  const normalized = normalizeCompanyRole(role);
  return new Set(ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.employee);
}

/**
 * @param {CompanyRole | string | null | undefined} role
 * @param {string} permission
 */
export function companyRoleHasPermission(role, permission) {
  return permissionsForCompanyRole(role).has(permission);
}

/**
 * @typedef {{
 *   userId: string,
 *   companyId: string,
 *   orgId: string,
 *   companyRole: CompanyRole,
 *   jobFunction: string,
 *   permissions: Set<string>,
 *   isOrgOwner: boolean,
 * }} CompanyAccessContext
 */

/** Document types employees may create (leave/expense); admins manage the full catalog. */
export const EMPLOYEE_CREATABLE_DOCUMENT_TYPES = Object.freeze(
  new Set(["leave_request", "expense_claim"])
);

/**
 * @param {{ userId: string, companyId: string, companyRole?: string, membershipRole?: string, jobFunction?: string }} input
 * @returns {CompanyAccessContext}
 */
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

/** @param {unknown} raw */
export function normalizeJobFunction(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (key === "human_resources") return "hr";
  return KNOWN_JOB_FUNCTIONS.has(key) ? key : "general";
}

export function buildCompanyAccessContext({ userId, companyId, companyRole, membershipRole, jobFunction }) {
  const rawMembership = String(membershipRole || "")
    .trim()
    .toLowerCase();
  const rawCompany = String(companyRole || "")
    .trim()
    .toLowerCase();
  const role = normalizeCompanyRole(companyRole ?? membershipRole);
  const isOrgOwner = rawMembership === "owner" || rawCompany === "owner";
  return {
    userId,
    companyId,
    orgId: companyId,
    companyRole: role,
    jobFunction: normalizeJobFunction(jobFunction),
    permissions: permissionsForCompanyRole(role),
    isOrgOwner,
  };
}

/**
 * Solo business owners and org owners see invoicing/revenue dashboard; invited members see company workspace only.
 * @param {CompanyAccessContext | null | undefined} ctx
 */
export function showBusinessOwnerDashboard(ctx) {
  if (!ctx?.companyId) return true;
  return Boolean(ctx.isOrgOwner);
}

/**
 * @param {CompanyAccessContext | null | undefined} ctx
 * @param {string} typeKey
 */
export function canCreateDocumentType(ctx, typeKey) {
  const key = String(typeKey || "").trim().toLowerCase();
  if (!key) return false;
  if (!ctx?.companyId || ctx.isOrgOwner) return true;
  if (hasCompanyPermission(ctx, PERMISSIONS.MANAGE_COMPANY_DOCUMENTS)) return true;
  if (!EMPLOYEE_CREATABLE_DOCUMENT_TYPES.has(key)) return false;
  if (key === "leave_request") return hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_LEAVE);
  return hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_DOCUMENTS);
}

/**
 * @param {CompanyAccessContext | null | undefined} ctx
 * @param {string} docType
 * @param {string} [docOwnerUserId]
 */
export function canApproveDocument(ctx, docType, docOwnerUserId) {
  if (!ctx) return false;
  const type = String(docType || "").trim().toLowerCase();
  const isHrApproval = type === "leave_request" || type === "expense_claim";
  if (!isHrApproval) {
    return hasCompanyPermission(ctx, PERMISSIONS.MANAGE_COMPANY_DOCUMENTS);
  }
  if (docOwnerUserId && ctx.userId === docOwnerUserId) return false;
  return (
    hasCompanyPermission(ctx, PERMISSIONS.APPROVE_LEAVE) ||
    hasCompanyPermission(ctx, PERMISSIONS.MANAGE_LEAVE)
  );
}

/**
 * @param {CompanyAccessContext | null | undefined} ctx
 * @param {string} permission
 */
export function hasCompanyPermission(ctx, permission) {
  if (!ctx?.permissions) return false;
  return ctx.permissions.has(permission);
}

/** @param {CompanyAccessContext | null | undefined} ctx @param {string} targetUserId */
export function canViewEmployee(ctx, targetUserId) {
  if (!ctx?.userId || !targetUserId) return false;
  if (ctx.userId === targetUserId) return true;
  if (ctx.companyRole === COMPANY_ROLES.ADMIN || ctx.companyRole === COMPANY_ROLES.MANAGER) {
    return hasCompanyPermission(ctx, PERMISSIONS.VIEW_TEAM_MEMBERS);
  }
  return false;
}

export function canManageEmployees(ctx) {
  return hasCompanyPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES);
}

export function canViewPayroll(ctx) {
  return (
    hasCompanyPermission(ctx, PERMISSIONS.MANAGE_PAYROLL) ||
    hasCompanyPermission(ctx, PERMISSIONS.VIEW_TEAM_PAYROLL_SUMMARY) ||
    hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_PAYSLIPS)
  );
}

export function canManageCompany(ctx) {
  return hasCompanyPermission(ctx, PERMISSIONS.MANAGE_COMPANY_SETTINGS);
}

export function canApproveLeave(ctx) {
  return hasCompanyPermission(ctx, PERMISSIONS.APPROVE_LEAVE);
}

export function canViewCompanyReports(ctx) {
  return hasCompanyPermission(ctx, PERMISSIONS.VIEW_COMPANY_REPORTS);
}

/**
 * Build Supabase filter hints for client-side queries (RLS is authoritative).
 * @param {CompanyAccessContext | null | undefined} ctx
 * @returns {{ scope: 'self'|'company', userId?: string, companyId?: string }}
 */
export function dataScopeForContext(ctx) {
  if (!ctx?.companyId) return { scope: "self" };
  if (ctx.companyRole === COMPANY_ROLES.ADMIN || ctx.companyRole === COMPANY_ROLES.MANAGER) {
    return { scope: "company", companyId: ctx.companyId };
  }
  return { scope: "self", userId: ctx.userId, companyId: ctx.companyId };
}

export const COMPANY_ROLE_LABELS = Object.freeze({
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
});
