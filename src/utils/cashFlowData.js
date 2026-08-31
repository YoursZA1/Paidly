import { Expense, Invoice, Payment } from "@/api/entities";
import { listAllCashFlowRecords } from "@/utils/cashFlowTruth";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

/** Shared React Query root for Cash Flow, Reports, and Accuracy read models. */
export const CASHFLOW_PAGE_QUERY_KEY = ["cashflow-page"];

const POS_SALES_PAGE = 500;
const POS_SALES_MAX = 10_000;
const POS_SALES_SELECT =
  "id, receipt_number, external_id, status, sale_kind, total_amount, currency, payment_method, occurred_at, items, raw_payload, refund_rail, parent_event_id, client_id";
const POS_SALES_SELECT_LEAN =
  "id, receipt_number, external_id, status, sale_kind, total_amount, currency, payment_method, occurred_at, items, raw_payload, parent_event_id, client_id";

function isMissingPosSalesSchema(message) {
  return /pos_sales_events|refund_rail|could not find the|does not exist|schema cache/i.test(String(message || ""));
}

/**
 * Paginate pos_sales_events the same way invoices/payments are paged for reports.
 * RLS scopes rows to the org. Writes still go through /api/pos/*.
 */
export async function listAllPosSalesEvents() {
  if (!isSupabaseConfigured) return [];
  const byId = new Map();
  let offset = 0;
  let columns = POS_SALES_SELECT;
  while (offset < POS_SALES_MAX) {
    const { data, error } = await supabase
      .from("pos_sales_events")
      .select(columns)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + POS_SALES_PAGE - 1);
    if (error) {
      if (columns === POS_SALES_SELECT && isMissingPosSalesSchema(error.message)) {
        columns = POS_SALES_SELECT_LEAN;
        continue;
      }
      if (isMissingPosSalesSchema(error.message)) return [];
      throw error;
    }
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (row?.id) byId.set(row.id, row);
    }
    if (rows.length < POS_SALES_PAGE) break;
    offset += POS_SALES_PAGE;
  }
  return Array.from(byId.values());
}

export async function fetchCashFlowPageData(profile) {
  const [expenses, invoices, payments, posSales] = await Promise.all([
    listAllCashFlowRecords(Expense, "-date"),
    listAllCashFlowRecords(Invoice, "-created_date"),
    listAllCashFlowRecords(Payment, "-paid_at"),
    listAllPosSalesEvents().catch(() => []),
  ]);
  return {
    expenses: expenses || [],
    invoices: invoices || [],
    payments: payments || [],
    posSales: posSales || [],
    user: profile || null,
  };
}
