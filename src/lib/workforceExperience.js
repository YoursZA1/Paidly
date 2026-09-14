import { createPageUrl } from "@/utils";
import { COMPANY_ROLES, hasCompanyPermission, PERMISSIONS } from "@/lib/companyPermissions";
import { isPosOnlyStaff } from "@shared/posStaffInvite.js";

export const WORKFORCE_EXPERIENCES = Object.freeze({
  OWNER: "owner",
  HR: "hr",
  FINANCE: "finance",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  POS_ONLY: "pos_only",
});

function jobFunctionKey(ctx) {
  return String(ctx?.jobFunction || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Highest authorized Workforce experience inside the active org.
 * Does not use SaaS get_my_tenant_context (that maps manager → company_admin).
 */
export function resolveWorkforceExperience(ctx) {
  if (!ctx?.companyId) return null;
  if (isPosOnlyStaff(ctx)) return WORKFORCE_EXPERIENCES.POS_ONLY;
  if (ctx.isOrgOwner) return WORKFORCE_EXPERIENCES.OWNER;
  if (ctx.companyRole === COMPANY_ROLES.ADMIN) return WORKFORCE_EXPERIENCES.HR;
  if (ctx.companyRole === COMPANY_ROLES.MANAGER) {
    const fn = jobFunctionKey(ctx);
    if (fn === "hr" || fn === "human_resources") return WORKFORCE_EXPERIENCES.HR;
    if (fn === "finance") return WORKFORCE_EXPERIENCES.FINANCE;
    return WORKFORCE_EXPERIENCES.MANAGER;
  }
  return WORKFORCE_EXPERIENCES.EMPLOYEE;
}

export function resolveWorkforceHomePath(ctx) {
  const experience = resolveWorkforceExperience(ctx);
  switch (experience) {
    case WORKFORCE_EXPERIENCES.POS_ONLY:
      return createPageUrl("POS");
    case WORKFORCE_EXPERIENCES.OWNER:
      return createPageUrl("Dashboard");
    case WORKFORCE_EXPERIENCES.FINANCE:
      return createPageUrl("Workforce/payroll");
    case WORKFORCE_EXPERIENCES.MANAGER:
      return createPageUrl("Workforce/manager");
    case WORKFORCE_EXPERIENCES.HR:
    case WORKFORCE_EXPERIENCES.EMPLOYEE:
      return createPageUrl("Workforce");
    default:
      return createPageUrl("Dashboard");
  }
}

export function isWorkforceGenericHomePath(pathname) {
  const p = String(pathname || "").toLowerCase();
  return (
    p === "/dashboard" ||
    p === "/employee-dashboard" ||
    p === "/employeedashboard"
  );
}

export function canSeeWorkforceNav(ctx) {
  if (!ctx?.companyId) return true;
  if (isPosOnlyStaff(ctx)) return false;
  return (
    hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_PAYSLIPS) ||
    hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_LEAVE) ||
    hasCompanyPermission(ctx, PERMISSIONS.VIEW_TEAM_MEMBERS) ||
    hasCompanyPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)
  );
}
