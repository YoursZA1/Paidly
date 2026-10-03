import { clearSessionOrgIdCache } from "@/api/auth/orgCache.js";
import { purgeQueryClientAfterLogout } from "@/core/query/persistedQueryClient";
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { clearActivePortalSlug } from "@/lib/workforcePortal/portalState.js";
import { clearCompanyAccessContextCache } from "@/services/CompanyContextService";
import { clearOnboardingContextCache } from "@/services/OnboardingRoleService";
import { clearTenantContextCache } from "@/services/TenantRoleService";
import { useAppStore } from "@/stores/useAppStore";

/** sessionStorage flag that skips the one-time post-login home redirect. */
export const TENANT_HOME_REDIRECT_FLAG = "paidly_tenant_home_redirected";

/**
 * A password sign-in replaces the previous GoTrue session and emits SIGNED_OUT
 * before SIGNED_IN. Expire only when that sign-out is the end state.
 * @param {string | null | undefined} liveUserId
 */
export function shouldExpireSessionAfterSignedOut(liveUserId) {
  return !liveUserId;
}

/**
 * Drop the previous account's tab context so the next sign-in resolves its own
 * business, role, and home. Safe on the employee portal page: that page re-enters
 * from the URL slug after the new session exists.
 */
export async function releasePreviousAccountContext() {
  clearActivePortalSlug();
  clearSessionOrgIdCache();
  clearTenantContextCache();
  clearCompanyAccessContextCache();
  clearOnboardingContextCache();
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(TENANT_HOME_REDIRECT_FLAG);
    }
  } catch {
    /* private mode */
  }
  try {
    useAppStore.getState().reset();
  } catch {
    /* store not ready */
  }
  try {
    await purgeQueryClientAfterLogout(getOrCreateAppQueryClient());
  } catch {
    /* query cache is best-effort */
  }
}
