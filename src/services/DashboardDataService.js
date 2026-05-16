import { supabase } from "@/lib/supabaseClient";
import { promiseWithTimeout } from "@/utils/fetchWithTimeout";
import {
  DASHBOARD_INVOICES_SUMMARY_SELECT,
  DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL,
  isPostgrestSelectOrSyntax400,
  mapDashboardInvoiceSummaryRow,
} from "@/schemas/dashboardInvoiceSummary";
import { sanitizePostgrestSelect } from "@/lib/postgrestSelect";

export const DASHBOARD_INVOICES_LIMIT = 40;
export const DASHBOARD_PAYSLIPS_LIMIT = 40;

/** Re-export for callers that need the exact PostgREST projection (must stay DB-valid). */
export {
  DASHBOARD_INVOICES_SUMMARY_SELECT,
  DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL,
  DASHBOARD_INVOICES_SUMMARY_POSTGREST_COLUMNS,
} from "@/schemas/dashboardInvoiceSummary";

export function dashboardInvoicesQueryKey(userId) {
  return ["dashboard", "invoices", userId ?? null];
}

export function dashboardPayslipsQueryKey(userId) {
  return ["dashboard", "payslips", userId ?? null];
}

const DASHBOARD_FETCH_TIMEOUT_MS = 20_000;

/**
 * Dashboard invoice strip. RLS does not change the select list; unknown columns yield HTTP 400 from PostgREST.
 * One bounded fallback uses a smaller column set if the primary projection fails (fork DB drift).
 */
export async function fetchDashboardInvoicesSummary(limit = DASHBOARD_INVOICES_LIMIT) {
  const runSelect = (selectList) => {
    const safeSelect = sanitizePostgrestSelect(selectList);
    return promiseWithTimeout(
      () =>
        supabase
          .from("invoices")
          .select(safeSelect)
          .order("created_at", { ascending: false })
          .limit(limit),
      DASHBOARD_FETCH_TIMEOUT_MS
    );
  };

  let { data, error } = await runSelect(DASHBOARD_INVOICES_SUMMARY_SELECT);

  if (error && isPostgrestSelectOrSyntax400(error)) {
    const second = await runSelect(DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL);
    data = second.data;
    error = second.error;
  }

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapDashboardInvoiceSummaryRow(row));
}

export async function fetchDashboardPayslipsSummary(limit = DASHBOARD_PAYSLIPS_LIMIT) {
  const { data, error } = await promiseWithTimeout(
    () =>
      supabase
        .from("payslips")
        .select(
          "id, payslip_number, employee_name, status, net_pay, gross_pay, total_deductions, pay_date, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
    DASHBOARD_FETCH_TIMEOUT_MS
  );
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
