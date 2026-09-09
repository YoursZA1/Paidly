import { supabaseAdmin } from "../supabaseAdmin.js";

export async function writeWorkforceAudit({
  orgId,
  employeeId,
  actorId,
  action,
  eventId = null,
  correlationId = null,
  before = null,
  after = null,
  metadata = null,
}) {
  try {
    await supabaseAdmin.from("workforce_audit_logs").insert({
      org_id: orgId,
      employee_id: employeeId || null,
      actor_id: actorId || null,
      action,
      event_id: eventId,
      correlation_id: correlationId,
      before_state: before,
      after_state: after || metadata || {},
    });
  } catch (err) {
    console.warn("[workforce] audit insert failed:", err?.message || err);
  }
}
