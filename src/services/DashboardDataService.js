import { supabase } from "@/lib/supabaseClient";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";

export const DASHBOARD_INVOICES_LIMIT = 40;
export const DASHBOARD_PAYSLIPS_LIMIT = 40;

export function dashboardInvoicesQueryKey(userId) {
  return ["dashboard", "invoices", userId ?? null];
}

export function dashboardPayslipsQueryKey(userId) {
  return ["dashboard", "payslips", userId ?? null];
}

export async function fetchDashboardInvoicesSummary(limit = DASHBOARD_INVOICES_LIMIT) {
  const { data, error } = await withTimeoutRetry(
    () =>
      supabase
        .from("invoices")
        .select(
          "id, client_id, invoice_number, status, total_amount, currency, created_at, created_date, delivery_date, user_id, created_by"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
    20000,
    1
  );
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchDashboardPayslipsSummary(limit = DASHBOARD_PAYSLIPS_LIMIT) {
  const { data, error } = await withTimeoutRetry(
    () =>
      supabase
        .from("payslips")
        .select(
          "id, payslip_number, employee_name, status, net_pay, gross_pay, total_deductions, pay_date, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
    20000,
    1
  );
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

