import { supabase } from "@/lib/supabaseClient";
import { clearOrgBootstrapInflight } from "@/lib/orgBootstrapApi";

/** Shared org resolution cache (EntityManager + AuthManager.logout). */
export const orgIdCache = {};

export function clearOrgIdCache() {
  Object.keys(orgIdCache).forEach((k) => delete orgIdCache[k]);
  clearOrgBootstrapInflight();
}

export function clearSessionOrgIdCache() {
  clearOrgIdCache();
}

/**
 * Active org for the signed-in user.
 * Company owners always use the org they own; invited team members use their joined org.
 */
export async function resolveActiveOrgIdForUser(userId) {
  const effectiveUserId = String(userId || "");
  if (!effectiveUserId) return null;

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
