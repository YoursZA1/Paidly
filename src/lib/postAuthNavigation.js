import { createPageUrl } from "@/utils";
import { isStaffDashboardRole, staffDashboardHomePath } from "@/lib/staffDashboard";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import {
  getAppDashboardUrl,
  shouldRedirectToAppAfterAuth,
} from "@/lib/appOrigin";

/**
 * @param {object | null | undefined} userLike
 * @param {string} [fallbackPath]
 */
export function resolvePostLoginPath(userLike, fallbackPath) {
  const role = String(userLike?.role || "").toLowerCase();
  if (isStaffDashboardRole(role)) return staffDashboardHomePath();
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
