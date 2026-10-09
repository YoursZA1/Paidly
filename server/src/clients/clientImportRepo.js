/**
 * Data access for Client Import. Client reads and writes use the caller's JWT so clients RLS
 * applies. The company id is always the server-resolved org. History stores counts only.
 */

const MATCH_COLUMNS = "id, name, email, phone, tax_id";

function runStatus(counts) {
  const created = counts.created || 0;
  const updated = counts.updated || 0;
  const failed = counts.failed || 0;
  if (failed > 0 && created + updated > 0) return "partial";
  if (failed > 0) return "failed";
  return "completed";
}

/**
 * @param {{ userClient: import("@supabase/supabase-js").SupabaseClient, adminClient: import("@supabase/supabase-js").SupabaseClient }} clients
 */
export function createClientImportRepo({ userClient, adminClient }) {
  return {
    async findMatches(orgId, { emails = [], phones = [], taxes = [] }) {
      if (!emails.length && !phones.length && !taxes.length) return [];
      const { data, error } = await userClient.rpc("client_import_matches", {
        p_org_id: orgId,
        p_emails: emails,
        p_phones: phones,
        p_taxes: taxes,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },

    async findByImportRefs(orgId, refs) {
      if (!refs.length) return [];
      const { data, error } = await userClient
        .from("clients")
        .select("id, import_ref")
        .eq("org_id", orgId)
        .in("import_ref", refs);
      if (error) throw error;
      return data || [];
    },

    async findByIds(orgId, ids) {
      if (!ids.length) return [];
      const { data, error } = await userClient.from("clients").select(MATCH_COLUMNS).eq("org_id", orgId).in("id", ids);
      if (error) throw error;
      return data || [];
    },

    async insertRows(rows) {
      if (!rows.length) return [];
      const { data, error } = await userClient
        .from("clients")
        .upsert(rows, { onConflict: "org_id,import_ref", ignoreDuplicates: true, defaultToNull: false })
        .select("id, import_ref");
      if (error) throw error;
      return data || [];
    },

    async updateRow(orgId, id, patch) {
      const { data, error } = await userClient
        .from("clients")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /**
     * Add this batch's real outcomes onto the import run. Sequential batches from one browser
     * read-modify-write the same row. Failures here must not undo client writes.
     */
    async recordRun({ id, orgId, userId, filename, counts }) {
      const { data: existing, error: readError } = await userClient
        .from("client_import_runs")
        .select("id, filename, created_count, updated_count, skipped_count, failed_count")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (readError) throw readError;
      const next = {
        created_count: Number(existing?.created_count || 0) + Number(counts.created || 0),
        updated_count: Number(existing?.updated_count || 0) + Number(counts.updated || 0),
        skipped_count: Number(existing?.skipped_count || 0) + Number(counts.skipped || 0),
        failed_count: Number(existing?.failed_count || 0) + Number(counts.failed || 0),
      };
      const row = {
        id,
        org_id: orgId,
        created_by_id: userId,
        filename: existing?.filename || filename || null,
        status: runStatus(next),
        ...next,
        updated_at: new Date().toISOString(),
      };
      const { error } = await userClient.from("client_import_runs").upsert(row, { onConflict: "id" });
      if (error) throw error;
    },

    async listRuns(orgId) {
      const { data, error } = await userClient
        .from("client_import_runs")
        .select("id, filename, status, created_count, updated_count, skipped_count, failed_count, created_at, updated_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },

    async writeAudit({ actor, orgId, action, description, metadata }) {
      try {
        await adminClient.from("audit_logs").insert({
          category: "clients",
          action,
          entity: "clients",
          actor_id: actor?.id || null,
          actor_email: actor?.email || null,
          actor_name: actor?.user_metadata?.full_name || actor?.email || null,
          description,
          metadata: { org_id: orgId, ...metadata },
        });
      } catch (err) {
        console.warn("[client-import] audit_logs insert failed:", err?.message || err);
      }
    },
  };
}
