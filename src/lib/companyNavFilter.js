import { PERMISSIONS, hasCompanyPermission, buildCompanyAccessContext } from "@/lib/companyPermissions";

/** Nav item ids visible to each company role (admin sees full app nav). */
const EMPLOYEE_NAV_IDS = new Set([
  "nav-dashboard",
  "nav-payslips",
  "nav-documents",
  "nav-settings",
]);

const MANAGER_EXTRA_NAV_IDS = new Set([
  "nav-reports",
  "nav-team-members",
  "nav-messages",
  "nav-calendar",
]);

/**
 * Filter primary sidebar items for company RBAC.
 * @param {Array<{ id?: string, type?: string }>} items
 * @param {{ companyRole?: string, userId?: string, companyId?: string } | null} membership
 */
export function filterNavigationForCompanyRole(items, membership) {
  if (!membership?.companyRole) {
    return items;
  }
  // Org owners keep full solo-business navigation (invoices, clients, cash flow, etc.).
  if (membership.isOrgOwner) {
    return items;
  }

  const ctx = buildCompanyAccessContext({
    userId: membership.userId || "",
    companyId: membership.companyId || "",
    companyRole: membership.companyRole,
  });

  const allowed = new Set(EMPLOYEE_NAV_IDS);

  if (membership.companyRole === "manager" || membership.companyRole === "admin") {
    for (const id of MANAGER_EXTRA_NAV_IDS) allowed.add(id);
    if (hasCompanyPermission(ctx, PERMISSIONS.VIEW_TEAM_LEAVE)) {
      allowed.add("nav-documents");
    }
  }

  if (membership.companyRole === "admin") {
    if (hasCompanyPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      allowed.add("nav-payslips");
    }
    if (hasCompanyPermission(ctx, PERMISSIONS.MANAGE_COMPANY_SETTINGS)) {
      allowed.add("nav-settings");
    }
  }

  return items.filter((item) => {
    if (item.type === "section") return true;
    if (!item.id) return true;
    if (item.id.startsWith("nav-admin-")) return false;
    return allowed.has(item.id);
  });
}
