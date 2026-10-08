import { Expense, Invoice, Payment } from "@/api/entities";
import { listAllCashFlowRecords } from "@/utils/cashFlowTruth";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { resolveSessionActiveOrgId } from "@/api/auth/sessionActiveOrg.js";

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
 * Scoped to the active business (RLS alone returns every org the user may read). Writes go through /api/pos/*.
 */
export async function listAllPosSalesEvents() {
  if (!isSupabaseConfigured) return [];
  const orgId = await resolveSessionActiveOrgId();
  if (!orgId) return [];
  const byId = new Map();
  let offset = 0;
  let columns = POS_SALES_SELECT;
  while (offset < POS_SALES_MAX) {
    const { data, error } = await supabase
      .from("pos_sales_events")
      .select(columns)
      .eq("org_id", orgId)
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

const PAY_RUN_SELECT =
  "id, period_label, period_start, period_end, pay_date, status, net_total, finalized_at, paid_at, cancelled_at, bank_payment_amount, bank_payment_date, bank_payment_expense_ids";
const PAY_RUN_SELECT_LEAN =
  "id, period_label, period_start, period_end, pay_date, status, net_total, finalized_at, paid_at, cancelled_at";
const PAYSLIP_CASH_SELECT =
  "id, pay_run_id, employee_name, payslip_number, pay_date, pay_period_end, net_pay, status, locked, finalized_at";

function isMissingPayrollColumn(message) {
  return /bank_payment_|could not find the|does not exist|schema cache/i.test(String(message || ""));
}

/** Finalized pay runs and issued payslips for the active business. Empty when payroll is not readable. */
export async function listPayrollCashSources() {
  if (!isSupabaseConfigured) return { payRuns: [], payslips: [] };
  const orgId = await resolveSessionActiveOrgId();
  if (!orgId) return { payRuns: [], payslips: [] };

  let runColumns = PAY_RUN_SELECT;
  let payRuns = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase.from("pay_runs").select(runColumns).eq("org_id", orgId);
    if (!error) {
      payRuns = Array.isArray(data) ? data : [];
      break;
    }
    if (attempt === 0 && runColumns === PAY_RUN_SELECT && isMissingPayrollColumn(error.message)) {
      runColumns = PAY_RUN_SELECT_LEAN;
      continue;
    }
    payRuns = [];
    break;
  }

  const { data: slips, error: slipError } = await supabase
    .from("payslips")
    .select(PAYSLIP_CASH_SELECT)
    .eq("org_id", orgId);
  return {
    payRuns,
    payslips: slipError ? [] : (Array.isArray(slips) ? slips : []),
  };
}

export async function fetchCashFlowPageData(profile) {
  const [expenses, invoices, payments, posSales, payroll] = await Promise.all([
    listAllCashFlowRecords(Expense, "-date"),
    listAllCashFlowRecords(Invoice, "-created_date"),
    listAllCashFlowRecords(Payment, "-paid_at"),
    listAllPosSalesEvents().catch(() => []),
    listPayrollCashSources().catch(() => ({ payRuns: [], payslips: [] })),
  ]);
  return {
    expenses: expenses || [],
    invoices: invoices || [],
    payments: payments || [],
    posSales: posSales || [],
    payRuns: payroll?.payRuns || [],
    payslips: payroll?.payslips || [],
    user: profile || null,
  };
}
