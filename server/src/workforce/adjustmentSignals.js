import { supabaseAdmin } from "../supabaseAdmin.js";
import { WORKFORCE_EVENT_TYPES } from "../../../shared/workforcePermissions.js";
import { outstandingAdjustmentSignals } from "../../../shared/payroll/adjustmentRun.js";

/**
 * Outstanding unpaid-leave-after-finalize signals for one org.
 * A signal drops off once a non-cancelled adjustment run covers the original pay run.
 *
 * @param {string} orgId
 */
export async function loadOutstandingAdjustmentSignals(orgId) {
  if (!orgId) return { needs_adjustment_run: false, signals: [] };

  let events = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("workforce_events")
      .select("id, employee_id, payload, created_at")
      .eq("org_id", orgId)
      .eq("event_type", WORKFORCE_EVENT_TYPES.PAYROLL_PROCESSED)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    events = (data || []).filter((row) => row.payload?.needs_adjustment_run);
  } catch {
    events = [];
  }

  const signals = events.map((row) => ({
    employee_id: row.employee_id || null,
    leave_request_id: row.payload?.leave_request_id || null,
    pay_run_ids: Array.isArray(row.payload?.pay_run_ids)
      ? row.payload.pay_run_ids.filter(Boolean)
      : [],
    at: row.created_at,
  }));

  let adjustmentRuns = [];
  try {
    const { data, error } = await supabaseAdmin
      .from("pay_runs")
      .select("id, original_pay_run_id, status")
      .eq("org_id", orgId)
      .eq("run_type", "adjustment");
    if (!error) adjustmentRuns = data || [];
  } catch {
    adjustmentRuns = [];
  }

  const outstanding = outstandingAdjustmentSignals(signals, adjustmentRuns);
  return {
    needs_adjustment_run: outstanding.length > 0,
    signals: outstanding.slice(0, 10),
  };
}
