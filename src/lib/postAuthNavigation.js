import { createPageUrl } from "@/utils";
import { isStaffDashboardRole, staffDashboardHomePath } from "@/lib/staffDashboard";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import {
  getAppDashboardUrl,
  shouldRedirectToAppAfterAuth,
} from "@/lib/appOrigin";
import { normalizeCompanyRole, COMPANY_ROLES } from "@/lib/companyPermissions";
import { isPosAccessPath, isPosOnlyStaff } from "@shared/posStaffInvite.js";
import { isWorkforceGenericHomePath, resolveWorkforceHomePath } from "@/lib/workforceExperience.js";
import { loadCompanyAccessContext } from "@/services/CompanyContextService.js";

function fallbackOrHome(fallbackPath, home) {
  if (!fallbackPath || isWorkforceGenericHomePath(fallbackPath) || fallbackPath.startsWith("/admin")) {
    return home;
  }
  return fallbackPath;
}

/**
 * Resolve home route from company membership (post-auth, does not touch login/signup).
 * @param {import('@/lib/companyPermissions').CompanyAccessContext | null | undefined} companyCtx
 */
export function resolveCompanyHomePath(companyCtx) {
  if (!companyCtx?.companyId) return createPageUrl("Dashboard");
  return resolveWorkforceHomePath(companyCtx);
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
    return fallbackOrHome(fallbackPath, resolveCompanyHomePath(companyCtx));
  }

  const companyRole = normalizeCompanyRole(userLike?.companyRole || userLike?.membershipRole);
  if (companyRole === COMPANY_ROLES.EMPLOYEE && userLike?.companyId) {
    if (isPosOnlyStaff(userLike)) return createPageUrl("POS");
    return fallbackOrHome(fallbackPath, createPageUrl("Workforce"));
  }

  const safeFallback =
    fallbackPath?.startsWith("/admin") ? createPageUrl("Dashboard") : fallbackPath;
  return safeFallback || createPageUrl("Dashboard");
}

/**
 * After email/password login succeeds: same-origin navigate or full redirect when split-host.
 * @param {{ navigate: (path: string, opts?: object) => void, fromPath?: string, companyCtx?: import('@/lib/companyPermissions').CompanyAccessContext | null }} opts
 * @returns {Promise<boolean>} true if a full-page redirect was started (caller should return)
 */
export async function completePostAuthNavigation({ navigate, fromPath, companyCtx = null }) {
  if (shouldRedirectToAppAfterAuth()) {
    window.location.replace(getAppDashboardUrl());
    return true;
  }

  const authUser = useAuthSessionStore.getState().user;
  let ctx = companyCtx;
  if (!ctx?.companyId && authUser?.id) {
    try {
      ctx = await loadCompanyAccessContext(authUser.id);
    } catch {
      ctx = null;
    }
  }
  const destination = resolvePostLoginPath(authUser, fromPath, ctx);
  navigate(destination, { replace: true });
  return false;
}
