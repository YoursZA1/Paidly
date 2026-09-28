/**
 * Active business for the signed-in session — the same deterministic rule as the entity layer
 * (`resolveActiveOrgIdForUser`: inside /employee/<slug> that workforce only; otherwise the org the user owns,
 * else their earliest membership) and the same cache.
 *
 * Raw PostgREST reads (dashboard aggregates, POS takings) must `.eq("org_id", orgId)` with this id: RLS
 * decides what the user may read, this decides which business the screen is about. Without it a user who
 * owns Business B and also works at Company A gets both companies' rows merged into one dashboard.
 * Read-only: never bootstraps an organization (EntityManager / ensureUserHasOrganization does that).
 */
import { getSessionWithRetry } from "@/api/auth/authSessionHelpers.js";
import { orgIdCache, orgCacheKey, resolveActiveOrgIdForUser } from "@/api/auth/orgCache.js";

/** @returns {Promise<string|null>} */
export async function resolveSessionActiveOrgId() {
  const { data } = await getSessionWithRetry();
  const userId = data?.session?.user?.id ? String(data.session.user.id) : "";
  if (!userId) return null;
  const key = orgCacheKey(userId);
  if (orgIdCache[key]) return orgIdCache[key];
  const orgId = await resolveActiveOrgIdForUser(userId);
  if (orgId) orgIdCache[key] = orgId;
  return orgId || null;
}
