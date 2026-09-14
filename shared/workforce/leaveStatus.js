// @ts-check

export const EMPLOYEE_LEAVE_STATUS = Object.freeze({
  ON_LEAVE: "on_leave",
  PENDING: "pending",
  UPCOMING: "upcoming",
  NONE: "none",
});

/**
 * Derived leave status for directory filters. Not stored.
 * Priority: on leave today → pending request → upcoming approved → none.
 *
 * @param {Array<{ status?: string, start_date?: string, end_date?: string }> | null | undefined} requests
 * @param {string} todayIso YYYY-MM-DD
 */
export function deriveEmployeeLeaveStatus(requests, todayIso) {
  const today = String(todayIso || "").slice(0, 10);
  const rows = Array.isArray(requests) ? requests : [];
  let onLeave = false;
  let pending = false;
  let upcoming = false;
  for (const row of rows) {
    const status = String(row?.status || "").toLowerCase();
    const start = String(row?.start_date || "").slice(0, 10);
    const end = String(row?.end_date || start).slice(0, 10);
    if (!start) continue;
    if (status === "approved" && start <= today && end >= today) onLeave = true;
    else if (status === "pending") pending = true;
    else if (status === "approved" && start > today) upcoming = true;
  }
  if (onLeave) return EMPLOYEE_LEAVE_STATUS.ON_LEAVE;
  if (pending) return EMPLOYEE_LEAVE_STATUS.PENDING;
  if (upcoming) return EMPLOYEE_LEAVE_STATUS.UPCOMING;
  return EMPLOYEE_LEAVE_STATUS.NONE;
}

/**
 * Unique employees with approved leave overlapping today.
 * @param {Array<{ status?: string, start_date?: string, end_date?: string, employee_id?: string }> | null | undefined} rows
 * @param {string} todayIso
 */
export function countEmployeesOnLeaveToday(rows, todayIso) {
  const today = String(todayIso || "").slice(0, 10);
  const ids = new Set();
  for (const row of rows || []) {
    if (String(row?.status || "").toLowerCase() !== "approved") continue;
    const start = String(row?.start_date || "").slice(0, 10);
    const end = String(row?.end_date || start).slice(0, 10);
    if (start && end && start <= today && end >= today && row.employee_id) {
      ids.add(row.employee_id);
    }
  }
  return ids.size;
}
