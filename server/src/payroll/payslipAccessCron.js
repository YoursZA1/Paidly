import { supabaseAdmin, notifyPayrollAdmins, writePayrollAudit } from "./payrollGate.js";
import { johannesburgYmd, formatIsoDate } from "../../../shared/payroll/dates.js";
import {
  groupPayslipAccessEvents,
  isPayslipAccessAnomaly,
} from "../../../shared/payroll/payslipAccessAnomaly.js";

export async function alertUnusualPayslipAccess({ sinceMs = 24 * 60 * 60 * 1000 } = {}) {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const today = formatIsoDate(johannesburgYmd().year, johannesburgYmd().month, johannesburgYmd().day);
  const { data, error } = await supabaseAdmin
    .from("document_events")
    .select("org_id, source_id, event_type, occurred_at")
    .eq("source_kind", "payslip")
    .in("event_type", ["opened", "clicked", "downloaded"])
    .gte("occurred_at", since)
    .limit(2000);
  if (error) throw error;

  const flagged = groupPayslipAccessEvents(data || []).filter(isPayslipAccessAnomaly);
  let alerted = 0;
  for (const row of flagged) {
    const nagKey = `payslip-access:${row.payslipId}:${today}`;
    const { data: already } = await supabaseAdmin
      .from("payroll_audit_logs")
      .select("id")
      .eq("org_id", row.orgId)
      .eq("action", "PAYSLIP_PUBLIC_ACCESS_ANOMALY")
      .contains("metadata", { nag_key: nagKey })
      .limit(1)
      .maybeSingle();
    if (already?.id) continue;

    const { data: slip } = await supabaseAdmin
      .from("payslips")
      .select("id, payslip_number, employee_name")
      .eq("id", row.payslipId)
      .maybeSingle();
    const label = slip?.payslip_number || row.payslipId;
    const message = `Unusual public payslip access for ${label} (${row.opened} opens, ${row.downloaded} downloads in 24h).`;
    await notifyPayrollAdmins(row.orgId, message, {
      emailSubject: "Paidly unusual payslip access",
      emailHtml: `<p>${message}</p>`,
    });
    await writePayrollAudit({
      orgId: row.orgId,
      action: "PAYSLIP_PUBLIC_ACCESS_ANOMALY",
      recordType: "payslips",
      recordId: row.payslipId,
      metadata: {
        nag_key: nagKey,
        opened: row.opened,
        clicked: row.clicked,
        downloaded: row.downloaded,
        payslip_number: slip?.payslip_number || null,
      },
    });
    alerted += 1;
  }
  return { scanned: (data || []).length, flagged: flagged.length, alerted };
}
