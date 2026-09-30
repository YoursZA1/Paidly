/**
 * Data access for Scan Receipt. Company data goes through `userClient` (the caller's own JWT) so RLS,
 * the plan-feature trigger and the receipts-bucket policies decide exactly as they do for the browser.
 * `adminClient` (service role) is used only for the audit trail and to confirm a supplier id belongs to
 * the server-resolved company (suppliers RLS is manager-only; staff may still link one).
 */
import { parseReceiptStoragePath } from "../../../shared/expenses/receiptScan.js";

export const RECEIPTS_BUCKET = "receipts";

const EXPENSE_RETURN_COLUMNS =
  "id, org_id, expense_number, category, description, amount, date, payment_method, vendor, vat, subtotal, " +
  "vat_rate, supplier_id, receipt_number, receipt_path, receipt_url, is_claimable, notes, capture_source, created_at, updated_at";

const DUPLICATE_COLUMNS = "id, vendor, supplier_id, amount, date, receipt_number, receipt_sha256";

/**
 * @param {{ userClient: import("@supabase/supabase-js").SupabaseClient, adminClient: import("@supabase/supabase-js").SupabaseClient }} clients
 */
export function createReceiptScanRepo({ userClient, adminClient }) {
  return {
    /** @param {string} path */
    async receiptExists(path) {
      const parsed = parseReceiptStoragePath(path);
      if (!parsed) return false;
      const folder = `${parsed.orgId}/receipts/${parsed.userId}`;
      const fileName = `${parsed.fileId}.${parsed.extension}`;
      const { data, error } = await userClient.storage.from(RECEIPTS_BUCKET).list(folder, { search: fileName, limit: 5 });
      if (error) throw error;
      return Array.isArray(data) && data.some((o) => o?.name === fileName);
    },

    /** @param {string} path @returns {Promise<Buffer>} */
    async downloadReceipt(path) {
      const { data, error } = await userClient.storage.from(RECEIPTS_BUCKET).download(path);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    },

    /** @param {string} path */
    async removeReceipt(path) {
      const { error } = await userClient.storage.from(RECEIPTS_BUCKET).remove([path]);
      if (error) throw error;
    },

    /** Suppliers the caller may see in this company (RLS: managers only; staff get []). @param {string} orgId */
    async listSuppliers(orgId) {
      const { data, error } = await userClient
        .from("suppliers")
        .select("id, name, tax_number")
        .eq("org_id", orgId)
        .order("name", { ascending: true })
        .limit(1000);
      if (error) return [];
      return data || [];
    },

    /** @param {string} orgId @param {string} supplierId */
    async supplierInCompany(orgId, supplierId) {
      const { data, error } = await adminClient
        .from("suppliers")
        .select("id, name")
        .eq("id", supplierId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    /**
     * Expenses that could be the same receipt. RLS limits staff to their own expenses, so the warning
     * never reveals a colleague's spending.
     * @param {string} orgId
     * @param {{ sha256?: string | null, receiptNumber?: string | null, total?: number | null, date?: string | null }} c
     */
    async findDuplicateSources(orgId, c) {
      const queries = [];
      if (c.sha256) {
        queries.push(userClient.from("expenses").select(DUPLICATE_COLUMNS).eq("org_id", orgId).eq("receipt_sha256", c.sha256).limit(5));
      }
      if (c.receiptNumber) {
        queries.push(
          userClient.from("expenses").select(DUPLICATE_COLUMNS).eq("org_id", orgId).eq("receipt_number", c.receiptNumber).limit(10)
        );
      }
      if (c.total != null && c.date) {
        queries.push(
          userClient.from("expenses").select(DUPLICATE_COLUMNS).eq("org_id", orgId).eq("amount", c.total).eq("date", c.date).limit(20)
        );
      }
      const results = await Promise.all(queries);
      const byId = new Map();
      for (const { data, error } of results) {
        if (error) continue; // older schema without the receipt columns: fewer checks, never a failure
        for (const row of data || []) byId.set(row.id, row);
      }
      return [...byId.values()];
    },

    /** @param {string} orgId @param {string} operationId */
    async findExpenseByOperation(orgId, operationId) {
      const { data, error } = await userClient
        .from("expenses")
        .select(EXPENSE_RETURN_COLUMNS)
        .eq("org_id", orgId)
        .eq("client_operation_id", operationId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    /** @param {Record<string, unknown>} row */
    async insertExpense(row) {
      const { data, error } = await userClient.from("expenses").insert(row).select(EXPENSE_RETURN_COLUMNS).single();
      if (error) throw error;
      return data;
    },

    /**
     * Company-scoped audit row (same table/shape as company invites). No receipt contents.
     * Failure never fails the user's action.
     */
    async writeAudit({ actor, orgId, action, description, metadata }) {
      try {
        await adminClient.from("audit_logs").insert({
          category: "expenses",
          action,
          entity: "expenses",
          actor_id: actor?.id || null,
          actor_email: actor?.email || null,
          actor_name: actor?.user_metadata?.full_name || actor?.email || null,
          description,
          metadata: { org_id: orgId, ...metadata },
        });
      } catch (err) {
        console.warn("[receipts] audit_logs insert failed:", err?.message || err);
      }
    },
  };
}
