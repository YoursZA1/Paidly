import { PERMISSIONS, hasCompanyPermission, buildCompanyAccessContext } from "@/lib/companyPermissions";
import { isPosOnlyStaff } from "@shared/posStaffInvite.js";
import { WORKFORCE_NAV_ID } from "@/lib/workforceNav.js";

/** Nav item ids visible to invited company members (org owners stay unfiltered). */
const EMPLOYEE_NAV_IDS = new Set([
  "nav-dashboard",
  WORKFORCE_NAV_ID,
  "nav-documents",
]);

const MANAGER_EXTRA_NAV_IDS = new Set([
  "nav-messages",
  "nav-calendar",
]);

function keepNavItem(item, allowed) {
  if (!item) return false;
  if (item.type === "section") return true;
  if (!item.id) return true;
  if (item.id.startsWith("nav-admin-")) return false;
  if (item.id === "nav-team-members") return false;
  if (item.id === WORKFORCE_NAV_ID) return allowed.has(WORKFORCE_NAV_ID);
  return allowed.has(item.id);
}

function filterNavTree(items, allowed) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!keepNavItem(item, allowed)) return null;
      if (!Array.isArray(item.children) || !item.children.length) return item;
      if (item.id === WORKFORCE_NAV_ID) {
        const children = item.children.filter(
          (child) => child && (!child.id || child.id.startsWith("nav-workforce-"))
        );
        return children.length ? { ...item, children } : { ...item, children: undefined };
      }
      const children = filterNavTree(item.children, allowed);
      if (!children.length) {
        return { ...item, children: undefined };
      }
      return { ...item, children };
    })
    .filter(Boolean);
}

function dropEmptySections(items) {
  return items.filter((item, index) => {
    if (item.type !== "section") return true;
    const rest = items.slice(index + 1);
    const nextSection = rest.findIndex((row) => row.type === "section");
    const block = nextSection === -1 ? rest : rest.slice(0, nextSection);
    return block.some((row) => row.type !== "section");
  });
}

/**
 * Filter primary sidebar items for company RBAC.
 * Recurses into children so Workforce nested items survive.
 * @param {Array<{ id?: string, type?: string, children?: object[] }>} items
 * @param {{ companyRole?: string, userId?: string, companyId?: string, isOrgOwner?: boolean, jobFunction?: string } | null} membership
 */
export function filterNavigationForCompanyRole(items, membership) {
  if (!membership?.companyRole) {
    return items;
  }
  if (membership.isOrgOwner) {
    return items;
  }

  const ctx = buildCompanyAccessContext({
    userId: membership.userId || "",
    companyId: membership.companyId || "",
    companyRole: membership.companyRole,
    jobFunction: membership.jobFunction,
  });

  if (isPosOnlyStaff({ ...membership, jobFunction: ctx.jobFunction })) {
    return dropEmptySections(items.filter((item) => item.type === "section" || item.id === "nav-pos"));
  }

  const allowed = new Set(EMPLOYEE_NAV_IDS);

  if (membership.companyRole === "manager" || membership.companyRole === "admin") {
    for (const id of MANAGER_EXTRA_NAV_IDS) allowed.add(id);
  }

  if (membership.companyRole === "admin") {
    if (hasCompanyPermission(ctx, PERMISSIONS.MANAGE_COMPANY_SETTINGS)) {
      allowed.add("nav-settings");
    }
  }

  return dropEmptySections(filterNavTree(items, allowed));
}
