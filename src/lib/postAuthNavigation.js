import { createPageUrl } from "@/utils";
import { isStaffDashboardRole, staffDashboardHomePath } from "@/lib/staffDashboard";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import {
  getAppDashboardUrl,
  shouldRedirectToAppAfterAuth,
} from "@/lib/appOrigin";
import { normalizeCompanyRole, COMPANY_ROLES } from "@/lib/companyPermissions";
import { isPosAccessPath, isPosOnlyStaff } from "@shared/posStaffInvite.js";

/**
 * Resolve home route from company membership (post-auth, does not touch login/signup).
 * @param {import('@/lib/companyPermissions').CompanyAccessContext | null | undefined} companyCtx
 */
export function resolveCompanyHomePath(companyCtx) {
  if (!companyCtx?.companyId) return createPageUrl("Dashboard");
  if (isPosOnlyStaff(companyCtx)) return createPageUrl("POS");
  if (companyCtx.isOrgOwner || companyCtx.companyRole === COMPANY_ROLES.ADMIN) {
    return createPageUrl("Dashboard");
  }
  if (companyCtx.companyRole === COMPANY_ROLES.MANAGER) {
    return createPageUrl("Dashboard");
  }
  return createPageUrl("employee-dashboard");
}

/**
 * @param {object | null | undefined} userLike
 * @param {string} [fallbackPath]
 * @param {import('@/lib/companyPermissions').CompanyAccessContext | null} [companyCtx]
 */
export function resolvePostLoginPath(userLike, fallbackPath, companyCtx = null) {
  const role = String(userLike?.role || "").toLowerCase();
  if (isStaffDashboardRole(role)) return staffDashboardHomePath();

  const posReturn = String(fallbackPath || "");
  if (isPosAccessPath(posReturn.split("?")[0])) {
    return posReturn;
  }

  if (companyCtx?.companyId) {
    const home = resolveCompanyHomePath(companyCtx);
    const safeFallback =
      fallbackPath?.startsWith("/admin") ? home : fallbackPath;
    return safeFallback || home;
  }

  const companyRole = normalizeCompanyRole(userLike?.companyRole || userLike?.membershipRole);
  if (companyRole === COMPANY_ROLES.EMPLOYEE && userLike?.companyId) {
    return createPageUrl("employee-dashboard");
  }

  const safeFallback =
    fallbackPath?.startsWith("/admin") ? createPageUrl("Dashboard") : fallbackPath;
  return safeFallback || createPageUrl("Dashboard");
}

/**
 * After email/password login succeeds: same-origin navigate or full redirect when split-host.
 * @param {{ navigate: (path: string, opts?: object) => void, fromPath?: string }} opts
 * @returns {boolean} true if a full-page redirect was started (caller should return)
 */
export function completePostAuthNavigation({ navigate, fromPath }) {
  if (shouldRedirectToAppAfterAuth()) {
    window.location.replace(getAppDashboardUrl());
    return true;
  }

  const authUser = useAuthSessionStore.getState().user;
  const destination = resolvePostLoginPath(authUser, fromPath);
  navigate(destination, { replace: true });
  return false;
}
