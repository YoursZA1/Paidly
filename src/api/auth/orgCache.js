import { supabase } from "@/lib/supabaseClient";
import { clearOrgBootstrapInflight } from "@/lib/orgBootstrapApi";
import { isPostgrestForbiddenError } from "@/utils/supabaseErrorUtils";
import { getActivePortalSlug, portalContextKey } from "@/lib/workforcePortal/portalState.js";

/**
 * Shared org resolution cache (EntityManager + AuthManager.logout). Keyed by {@link orgCacheKey}: the same
 * user resolves to different businesses in the default context and inside an employee portal.
 */
export const orgIdCache = {};

/** @param {string} userId */
export function orgCacheKey(userId) {
  return `${String(userId || "")}|${portalContextKey()}`;
}

/**
 * Org behind the active employee portal, only when the caller holds an ACTIVE membership there
 * (resolve_my_workforce_portal checks auth.uid(), disabled_at, portal_revoked_at). Otherwise null.
 * @param {string} slug
 */
export async function resolvePortalOrgId(slug) {
  const { data, error } = await supabase.rpc("resolve_my_workforce_portal", { p_slug: slug });
  if (error) {
    console.warn("[Paidly] Employee portal could not be resolved:", error.message || error);
    return null;
  }
  return data?.ok === true && data.org_id ? String(data.org_id) : null;
}

export function clearOrgIdCache() {
  Object.keys(orgIdCache).forEach((k) => delete orgIdCache[k]);
  clearOrgBootstrapInflight();
}

export function clearSessionOrgIdCache() {
  clearOrgIdCache();
}

/**
 * Active org for the signed-in user.
 * Inside an employee portal (/employee/<slug>): that workforce only, or null — never another business.
 * Otherwise: company owners use the org they own; invited team members use their joined org.
 */
export async function resolveActiveOrgIdForUser(userId) {
  const effectiveUserId = String(userId || "");
  if (!effectiveUserId) return null;

  const portalSlug = getActivePortalSlug();
  if (portalSlug) return resolvePortalOrgId(portalSlug);

  const { data: ownedOrg, error: ownedErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", effectiveUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedErr && !ownedErr.message?.includes("0 rows")) {
    console.warn("Error resolving owned organization:", ownedErr);
  }
  if (isPostgrestForbiddenError(ownedErr)) return null;
  if (ownedOrg?.id) return ownedOrg.id;

  const { data: invitedMembership, error: membershipCheckError } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipCheckError && !membershipCheckError.message?.includes("0 rows")) {
    console.warn("Error checking membership:", membershipCheckError);
  }
  return invitedMembership?.org_id ?? null;
}

/** @deprecated Prefer resolveActiveOrgIdForUser */
export async function fetchPrimaryMembershipOrgId(userId) {
  return resolveActiveOrgIdForUser(userId);
}
