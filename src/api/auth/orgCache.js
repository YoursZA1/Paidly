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

export async function fetchPrimaryMembershipOrgId(userId) {
  const effectiveUserId = String(userId || "");
  if (!effectiveUserId) return null;
  const { data: existingMembership, error: membershipCheckError } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipCheckError && !membershipCheckError.message?.includes("0 rows")) {
    console.warn("Error checking membership:", membershipCheckError);
  }
  return existingMembership?.org_id ?? null;
}
