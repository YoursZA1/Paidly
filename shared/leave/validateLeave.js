import { compareIsoDate, parseIsoDate } from "../payroll/dates.js";
import { countWorkingDays, computeLeaveBalance } from "./leaveMath.js";

/**
 * Server-side leave application validation. Pure.
 *
 * @param {{
 *   employeeActive: boolean,
 *   leaveTypeActive: boolean,
 *   startIso: string,
 *   endIso: string,
 *   halfDay?: boolean,
 *   excludeWeekends?: boolean,
 *   holidayIsos?: string[],
 *   balance: { entitled?: number, accrued?: number, used?: number, pending?: number, maxBalance?: number | null },
 *   unpaid?: boolean,
 *   overlapping?: Array<{ start_date: string, end_date: string, status: string, id?: string }>,
 *   ignoreRequestId?: string,
 * }} input
 */
export function validateLeaveApplication(input) {
  const errors = [];
  if (!input.employeeActive) errors.push("Employee is not active.");
  if (!input.leaveTypeActive) errors.push("This leave type is not active.");

  const start = parseIsoDate(input.startIso);
  const end = parseIsoDate(input.endIso);
  if (!start) errors.push("Start date is invalid.");
  if (!end) errors.push("End date is invalid.");
  if (start && end && compareIsoDate(input.endIso, input.startIso) < 0) {
    errors.push("Start date must be on or before the end date.");
  }

  const workingDays = start && end
    ? countWorkingDays(input.startIso, input.endIso, {
        excludeWeekends: input.excludeWeekends !== false,
        holidayIsos: input.holidayIsos,
        halfDay: Boolean(input.halfDay),
      })
    : 0;

  if (start && end && workingDays <= 0) {
    errors.push("Request does not include any working days.");
  }

  const overlaps = (input.overlapping || []).filter((row) => {
    if (input.ignoreRequestId && row.id === input.ignoreRequestId) return false;
    const status = String(row.status || "").toLowerCase();
    if (status !== "pending" && status !== "approved") return false;
    return rangesOverlap(input.startIso, input.endIso, row.start_date, row.end_date);
  });
  if (overlaps.length > 0) {
    errors.push("These dates overlap an existing pending or approved leave request.");
  }

  const computed = computeLeaveBalance(input.balance || {});
  if (!input.unpaid && workingDays > computed.available + 1e-9) {
    errors.push(
      `Insufficient leave balance. Requested ${workingDays} working day(s); ${computed.available} available.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    workingDays,
    available: computed.available,
    remainingAfterApproval: input.unpaid
      ? computed.available
      : Math.round((computed.available - workingDays) * 100) / 100,
  };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return compareIsoDate(aStart, bEnd) <= 0 && compareIsoDate(bStart, aEnd) <= 0;
}
