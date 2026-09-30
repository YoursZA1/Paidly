/**
 * Data access for Product Import. Catalogue reads/writes go through `userClient` (the caller's own JWT)
 * so the services RLS policy, the plan-feature trigger and adjust_inventory_stock's plan check decide
 * exactly as they do for the Products page. Every query also filters on the server-resolved org id.
 * `adminClient` (service role) is used only for the audit trail.
 */

const TARGET_COLUMNS = "id, org_id, name, sku, barcode, item_type, is_active, stock_quantity, type_specific_data";

/**
 * @param {{ userClient: import("@supabase/supabase-js").SupabaseClient, adminClient: import("@supabase/supabase-js").SupabaseClient }} clients
 */
export function createProductImportRepo({ userClient, adminClient }) {
  return {
    /** Existing catalogue rows of this company sharing a SKU / barcode / name. */
    async findMatches(orgId, { skus = [], barcodes = [], names = [] }) {
      if (!skus.length && !barcodes.length && !names.length) return [];
      const { data, error } = await userClient.rpc("catalog_import_matches", {
        p_org_id: orgId,
        p_skus: skus,
        p_barcodes: barcodes,
        p_names: names,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },

    /** Rows an earlier (possibly retried) call of this import already created. */
    async findByImportRefs(orgId, refs) {
      if (!refs.length) return [];
      const { data, error } = await userClient
        .from("services")
        .select("id, import_ref, item_type, stock_quantity")
        .eq("org_id", orgId)
        .in("import_ref", refs);
      if (error) throw error;
      return data || [];
    },

    /** Update targets, only ever within this company. */
    async findByIds(orgId, ids) {
      if (!ids.length) return [];
      const { data, error } = await userClient.from("services").select(TARGET_COLUMNS).eq("org_id", orgId).in("id", ids);
      if (error) throw error;
      return data || [];
    },

    /**
     * Insert new rows; a row whose (org_id, import_ref) already exists is left alone (ON CONFLICT DO
     * NOTHING) — it was created by an earlier attempt of the same import. Missing keys take column
     * defaults (not NULL).
     * @returns {Promise<Array<{ id: string, import_ref: string }>>}
     */
    async insertRows(rows) {
      if (!rows.length) return [];
      const { data, error } = await userClient
        .from("services")
        .upsert(rows, { onConflict: "org_id,import_ref", ignoreDuplicates: true, defaultToNull: false })
        .select("id, import_ref");
      if (error) throw error;
      return data || [];
    },

    async updateRow(orgId, id, patch) {
      const { data, error } = await userClient
        .from("services")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Stock only moves through the ledger (logs an inventory_movements row). */
    async adjustStock(orgId, productId, delta, source) {
      const { error } = await userClient.rpc("adjust_inventory_stock", {
        p_product_id: productId,
        p_org_id: orgId,
        p_delta: delta,
        p_type: delta > 0 ? "in" : "out",
        p_source: source,
        p_reference_id: null,
      });
      if (error) throw error;
    },

    /** Was the opening stock of an imported product already recorded (retry after a lost response)? */
    async hasOpeningStock(productId) {
      const { data, error } = await userClient
        .from("inventory_movements")
        .select("id")
        .eq("product_id", productId)
        .eq("source", "initial_stock")
        .limit(1);
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    },

    async writeAudit({ actor, orgId, action, description, metadata }) {
      try {
        await adminClient.from("audit_logs").insert({
          category: "inventory",
          action,
          entity: "services",
          actor_id: actor?.id || null,
          actor_email: actor?.email || null,
          actor_name: actor?.user_metadata?.full_name || actor?.email || null,
          description,
          metadata: { org_id: orgId, ...metadata },
        });
      } catch (err) {
        console.warn("[product-import] audit_logs insert failed:", err?.message || err);
      }
    },
  };
}
