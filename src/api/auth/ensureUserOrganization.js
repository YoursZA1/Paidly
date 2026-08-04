/**
 * Ensure the active session user has an org (membership), bootstrapping via API if needed.
 * Kept outside EntityManager so CompanyContextService can call it without the
 * entities → apiClient → customClient import cycle.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  runOrgBootstrapWithLock,
  getOrgBootstrapCircuitOpenUntil,
  recordOrgBootstrapFailure,
} from "@/lib/orgBootstrapApi";
import { orgIdCache, fetchPrimaryMembershipOrgId } from "@/api/auth/orgCache.js";
import {
  getSessionWithRetry,
  isSupabaseAuthUuid,
} from "@/api/auth/authSessionHelpers.js";
import { assertSessionAuthorityAllowsMutations } from "@/api/entity/entityShared.js";

/**
 * @param {string} userId Requested user id (must match or be replaced by the active session uid).
 * @returns {Promise<string>} org_id
 */
export async function ensureUserHasOrganization(userId) {
  assertSessionAuthorityAllowsMutations();
  const requestedUserId = String(userId || "");
  if (!requestedUserId || !isSupabaseAuthUuid(requestedUserId)) {
    throw new Error("Organization setup requires a valid signed-in user (Supabase auth id).");
  }
  if (orgIdCache[requestedUserId]) return orgIdCache[requestedUserId];

  let sessionUid = null;
  try {
    const { data: gu } = await supabase.auth.getUser();
    sessionUid = gu?.user?.id ?? null;
  } catch {
    /* fall through */
  }
  if (!sessionUid) {
    const { data: sd } = await getSessionWithRetry();
    sessionUid = sd?.session?.user?.id ?? null;
  }

  if (!sessionUid || !isSupabaseAuthUuid(String(sessionUid))) {
    throw new Error("Organization setup requires the active session user. Sign in again and retry.");
  }

  const effectiveUserId = String(sessionUid);
  if (sessionUid && sessionUid !== requestedUserId) {
    console.warn(
      `[Paidly] ensureUserHasOrganization: session/request user mismatch; using active session user ${sessionUid}.`
    );
    delete orgIdCache[requestedUserId];
  }

  if (!isSupabaseConfigured) {
    throw new Error("Organization setup requires Supabase to be configured.");
  }

  try {
    let orgId = await fetchPrimaryMembershipOrgId(effectiveUserId);
    if (orgId) {
      orgIdCache[effectiveUserId] = orgId;
      return orgId;
    }

    if (getOrgBootstrapCircuitOpenUntil(effectiveUserId) > Date.now()) {
      throw new Error(
        "Organization bootstrap is cooling down after repeated errors. Please retry in a moment or contact support."
      );
    }

    const { data: sessionForToken } = await getSessionWithRetry();
    if (!sessionForToken?.session?.access_token) {
      throw new Error("Organization setup requires an authenticated session.");
    }

    try {
      await runOrgBootstrapWithLock(effectiveUserId, {
        getExistingOrgId: () => fetchPrimaryMembershipOrgId(effectiveUserId),
      });
    } catch (err) {
      console.warn("[Paidly] Organization bootstrap request failed:", err);
      throw new Error(
        `Failed to set up organization: ${err?.message || err}. Please try again or contact support.`
      );
    }

    orgId = await fetchPrimaryMembershipOrgId(effectiveUserId);
    if (orgId) {
      orgIdCache[effectiveUserId] = orgId;
      return orgId;
    }

    recordOrgBootstrapFailure(effectiveUserId);
    throw new Error(
      "Organization membership missing after server bootstrap. Please refresh the page or contact support."
    );
  } catch (error) {
    console.error("Error in ensureUserHasOrganization:", error);
    throw error;
  }
}
