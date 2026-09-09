// @ts-check

const EVENT_TO_ACTION = Object.freeze({
  "employee.created": "employee.created",
  "employee.updated": "employee.updated",
  "employee.portal.invited": "employee.portal.invited",
  "employee.portal.activated": "employee.portal.activated",
  "employee.leave_approved": "leave.approved",
  "employee.leave_rejected": "leave.rejected",
  "leave.applied": "leave.applied",
  "payroll.processed": "payroll.processed",
  "payslip.generated": "payslip.generated",
});

const COMPENSATION_KEYS = new Set([
  "base_salary",
  "hourly_rate",
  "daily_rate",
  "salary",
  "banking",
  "tax_identifiers",
  "net_pay",
  "gross_pay",
]);

/**
 * @param {Record<string, unknown> | null | undefined} state
 */
export function stripCompensationFromTimelineState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return state || null;
  const next = { ...state };
  for (const key of Object.keys(next)) {
    if (COMPENSATION_KEYS.has(key)) delete next[key];
  }
  return next;
}

function timelineKey(action, row) {
  const payload = row.after_state || row.after || row.payload || {};
  const ref =
    payload.leave_request_id ||
    payload.payslip_id ||
    payload.pay_run_id ||
    row.event_id ||
    row.id ||
    "";
  return `${String(action || "")}:${String(ref)}`;
}

/**
 * Merge workforce_audit_logs with workforce_events for the employee profile.
 * Audit rows win when the same leave/payroll fact was recorded twice.
 *
 * @param {Array<Record<string, unknown>>} audits
 * @param {Array<Record<string, unknown>>} events
 * @param {{ canManagePayroll?: boolean }} [opts]
 */
export function mergeEmployeeTimeline(audits = [], events = [], opts = {}) {
  const items = [];
  const seen = new Set();
  for (const row of audits) {
    const action = String(row.action || "");
    const key = timelineKey(action, row);
    seen.add(key);
    items.push({
      id: row.id,
      source: "audit",
      at: row.created_at,
      action,
      before: row.before_state || row.before || null,
      after: row.after_state || row.after || null,
    });
  }
  for (const row of events) {
    const action = EVENT_TO_ACTION[row.event_type] || String(row.event_type || "");
    const key = timelineKey(action, { ...row, payload: row.payload });
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: row.id,
      source: "event",
      at: row.created_at,
      action,
      before: null,
      after: row.payload || null,
    });
  }
  items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  if (opts.canManagePayroll) return items;
  return items.map((item) => ({
    ...item,
    before: stripCompensationFromTimelineState(item.before),
    after: stripCompensationFromTimelineState(item.after),
  }));
}
