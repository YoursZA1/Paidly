/**
 * POST /api/admin/clean-orphaned-users — calls DB RPC (service_role only).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @returns {Promise<{ deleted: number }>}
 */
export async function runAdminDeleteOrphanProfiles(supabaseAdmin) {
  const { data, error } = await supabaseAdmin.rpc("admin_delete_orphan_profiles");
  if (error) {
    throw new Error(error.message);
  }
  const deleted = typeof data === "number" ? data : Number(data) || 0;
  return { deleted };
}
