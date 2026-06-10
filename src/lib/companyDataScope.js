import { dataScopeForContext } from "@/lib/companyPermissions";
import { loadCompanyAccessContext } from "@/services/CompanyContextService";

/**
 * Build a self-scope OR filter with org_id bound on every branch (tenant-safe).
 * @param {string} orgColumn
 * @param {string} orgId
 * @param {string} userId
 * @param {string} userColumn
 */
export function buildSelfScopeOrFilter(orgColumn, orgId, userId, userColumn = "user_id") {
  return [
    `and(${orgColumn}.eq.${orgId},${userColumn}.eq.${userId})`,
    `and(${orgColumn}.eq.${orgId},created_by.eq.${userId})`,
    `and(${orgColumn}.eq.${orgId},assigned_user_id.eq.${userId})`,
    `and(${orgColumn}.eq.${orgId},employee_user_id.eq.${userId})`,
  ].join(",");
}

/**
 * Apply company role data scoping to Supabase queries (defense in depth; RLS is authoritative).
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder<any, any, any>} query
 * @param {import('@/lib/companyPermissions').CompanyAccessContext | null} ctx
 * @param {{ userColumn?: string, orgColumn?: string }} [options]
 */
export function applyCompanyDataScope(query, ctx, { userColumn = "user_id", orgColumn = "org_id" } = {}) {
  const scope = dataScopeForContext(ctx);
  if (!scope.companyId) return query;

  if (scope.scope === "self" && scope.userId) {
    return query.or(
      buildSelfScopeOrFilter(orgColumn, scope.companyId, scope.userId, userColumn)
    );
  }

  return query.eq(orgColumn, scope.companyId);
}

/**
 * Load context + return scoped filter metadata for services.
 * @param {string} userId
 */
export async function resolveCompanyDataScope(userId) {
  const ctx = await loadCompanyAccessContext(userId);
  return { ctx, scope: dataScopeForContext(ctx) };
}
