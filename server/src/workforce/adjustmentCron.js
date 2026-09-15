import { supabaseAdmin, notifyPayrollAdmins, writePayrollAudit } from "../payroll/payrollGate.js";
import { johannesburgYmd, formatIsoDate } from "../../../shared/payroll/dates.js";
import { uncoveredPayRunIds } from "../../../shared/payroll/adjustmentRun.js";
import { WORKFORCE_EVENT_TYPES } from "../../../shared/workforcePermissions.js";
import { loadOutstandingAdjustmentSignals } from "./adjustmentSignals.js";
import { ensureDraftAdjustmentRun } from "../payroll/payrollService.js";

const NAG_AFTER_MS = 24 * 60 * 60 * 1000;
const OVERDUE_MS = 7 * 24 * 60 * 60 * 1000;

async function loadAdjustmentSignalEvents() {
  const { data, error } = await supabaseAdmin
    .from("workforce_events")
    .select("id, org_id, employee_id, payload, created_at")
    .eq("event_type", WORKFORCE_EVENT_TYPES.PAYROLL_PROCESSED)
    .filter("payload->>needs_adjustment_run", "eq", "true")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function processOutstandingAdjustmentRuns() {
  const events = await loadAdjustmentSignalEvents();
  const orgIds = [...new Set(events.map((row) => row.org_id).filter(Boolean))];
  let drafted = 0;
  let skipped = 0;
  for (const orgId of orgIds) {
    const { signals } = await loadOutstandingAdjustmentSignals(orgId);
    const uncovered = uncoveredPayRunIds(signals);
    for (const payRunId of uncovered) {
      const result = await ensureDraftAdjustmentRun(orgId, payRunId, null);
      if (result.created) drafted += 1;
      else skipped += 1;
    }
  }
  return { orgs: orgIds.length, drafted, skipped };
}

export async function nagOutstandingAdjustmentRuns() {
  const events = await loadAdjustmentSignalEvents();
  const cutoff = Date.now() - NAG_AFTER_MS;
  const today = formatIsoDate(johannesburgYmd().year, johannesburgYmd().month, johannesburgYmd().day);
  let nagged = 0;
  const byOrg = new Map();
  for (const row of events) {
    if (new Date(row.created_at).getTime() > cutoff) continue;
    const orgId = row.org_id;
    if (!orgId) continue;
    const { signals } = await loadOutstandingAdjustmentSignals(orgId);
    if (!signals.length) continue;
    const uncovered = uncoveredPayRunIds(signals);
    if (!uncovered.length) continue;
    if (byOrg.has(orgId)) continue;
    byOrg.set(orgId, uncovered);
    const nagKey = `adjustment-nag:${orgId}:${today}`;
    const { data: already } = await supabaseAdmin
      .from("payroll_audit_logs")
      .select("id")
      .eq("org_id", orgId)
      .eq("action", "ADJUSTMENT_RUN_NAG")
      .contains("metadata", { nag_key: nagKey })
      .limit(1)
      .maybeSingle();
    if (already?.id) continue;
    const overdue = events.some(
      (event) => event.org_id === orgId && Date.now() - new Date(event.created_at).getTime() >= OVERDUE_MS
    );
    const message = overdue
      ? `Overdue: payroll still needs an adjustment run after 7 days (${uncovered.length} finalized period${
          uncovered.length === 1 ? "" : "s"
        }). Open Workforce → Payroll to complete it.`
      : `Payroll needs an adjustment run (${uncovered.length} finalized period${
          uncovered.length === 1 ? "" : "s"
        }). Open Workforce → Payroll to complete it.`;
    await notifyPayrollAdmins(orgId, message, {
      emailSubject: overdue ? "Paidly payroll adjustment overdue" : "Paidly payroll adjustment required",
      emailHtml: `<p>${message}</p>`,
    });
    await writePayrollAudit({
      orgId,
      action: "ADJUSTMENT_RUN_NAG",
      recordType: "pay_runs",
      recordId: uncovered[0],
      metadata: { nag_key: nagKey, pay_run_ids: uncovered },
    });
    nagged += 1;
  }
  return { nagged };
}
