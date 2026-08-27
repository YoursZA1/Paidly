/**
 * Document brands — rows in public.companies for the current organization.
 * Not the tenant (organizations) and not CompanyContext RBAC.
 */
import { supabase } from "@/lib/supabaseClient";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { resolveActiveOrgIdForUser } from "@/api/auth/orgCache.js";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const BRAND_COLUMNS = "id, org_id, name, logo_url, created_at, updated_at";

async function requireActor() {
  const session = await getStableSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in to manage brands.");
  const orgId = await resolveActiveOrgIdForUser(userId);
  if (!orgId) throw new Error("Unable to determine organization for current user.");
  return { userId, orgId };
}

function throwQuery(error, fallback) {
  throw new Error(getSupabaseErrorMessage(error, fallback));
}

export const OrgBrandService = {
  async list() {
    const { orgId } = await requireActor();
    const { data, error } = await supabase
      .from("companies")
      .select(BRAND_COLUMNS)
      .eq("org_id", orgId)
      .order("name", { ascending: true });
    if (error) throwQuery(error, "Failed to load brands");
    return Array.isArray(data) ? data : [];
  },

  /**
   * @param {{ name: string, logo_url?: string | null }} payload
   */
  async create(payload) {
    const { orgId } = await requireActor();
    const name = String(payload?.name || "").trim();
    if (!name) throw new Error("Brand name is required.");
    const { data, error } = await supabase
      .from("companies")
      .insert({
        org_id: orgId,
        name,
        logo_url: payload?.logo_url ? String(payload.logo_url).trim() : null,
      })
      .select(BRAND_COLUMNS)
      .single();
    if (error) throwQuery(error, "Failed to create brand");
    return data;
  },

  /**
   * @param {string} id
   * @param {{ name?: string, logo_url?: string | null }} patch
   */
  async update(id, patch = {}) {
    const { orgId } = await requireActor();
    const brandId = String(id || "").trim();
    if (!brandId) throw new Error("Brand id is required.");
    const next = {};
    if (patch.name !== undefined) {
      const name = String(patch.name || "").trim();
      if (!name) throw new Error("Brand name is required.");
      next.name = name;
    }
    if (patch.logo_url !== undefined) {
      next.logo_url = patch.logo_url ? String(patch.logo_url).trim() : null;
    }
    if (Object.keys(next).length === 0) {
      const { data } = await supabase
        .from("companies")
        .select(BRAND_COLUMNS)
        .eq("id", brandId)
        .eq("org_id", orgId)
        .maybeSingle();
      return data;
    }
    const { data, error } = await supabase
      .from("companies")
      .update(next)
      .eq("id", brandId)
      .eq("org_id", orgId)
      .select(BRAND_COLUMNS)
      .single();
    if (error) throwQuery(error, "Failed to update brand");
    return data;
  },

  async remove(id) {
    const { orgId } = await requireActor();
    const brandId = String(id || "").trim();
    if (!brandId) throw new Error("Brand id is required.");
    const { error } = await supabase.from("companies").delete().eq("id", brandId).eq("org_id", orgId);
    if (error) throwQuery(error, "Failed to delete brand");
    return true;
  },
};
