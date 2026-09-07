import { compareIsoDate } from "./dates.js";
import { countWorkingDays } from "../leave/leaveMath.js";
import { ROUND_MONEY } from "./constants.js";

function clampIso(iso, minIso, maxIso) {
  const value = String(iso || "").slice(0, 10);
  if (!value) return "";
  if (minIso && compareIsoDate(value, minIso) < 0) return minIso;
  if (maxIso && compareIsoDate(value, maxIso) > 0) return maxIso;
  return value;
}

/**
 * Working days of a leave request that fall inside a payroll period.
 */
export function overlapWorkingDays(periodStart, periodEnd, leaveStart, leaveEnd, opts = {}) {
  const start = clampIso(leaveStart, periodStart, periodEnd);
  const end = clampIso(leaveEnd, periodStart, periodEnd);
  if (!start || !end || compareIsoDate(end, start) < 0) return 0;
  const halfDay = Boolean(opts.halfDay) && String(leaveStart).slice(0, 10) === String(leaveEnd).slice(0, 10);
  return countWorkingDays(start, end, {
    excludeWeekends: opts.excludeWeekends !== false,
    holidayIsos: opts.holidayIsos,
    halfDay,
  });
}

/**
 * Sum approved unpaid leave overlapping the pay period.
 * Does not copy leave rows into payroll — callers pass the approved requests.
 *
 * @param {{
 *   periodStart: string,
 *   periodEnd: string,
 *   requests?: Array<{
 *     start_date?: string,
 *     end_date?: string,
 *     half_day?: boolean,
 *     status?: string,
 *     leave_types?: { paid?: boolean, exclude_weekends?: boolean },
 *     paid?: boolean,
 *   }>,
 * }} input
 */
export function unpaidLeaveDaysInPeriod({ periodStart, periodEnd, requests = [] } = {}) {
  let days = 0;
  for (const row of requests || []) {
    const status = String(row?.status || "approved").toLowerCase();
    if (status && status !== "approved") continue;
    const paid = row?.leave_types?.paid ?? row?.paid;
    if (paid !== false) continue;
    days += overlapWorkingDays(periodStart, periodEnd, row.start_date, row.end_date, {
      halfDay: Boolean(row.half_day),
      excludeWeekends: row.leave_types?.exclude_weekends !== false,
    });
  }
  return Math.round(days * 100) / 100;
}

export function unpaidLeaveAmount({ basicPay, unpaidDays, workingDaysInPeriod }) {
  const basic = Number(basicPay) || 0;
  const days = Number(unpaidDays) || 0;
  const working = Number(workingDaysInPeriod) || 0;
  if (basic <= 0 || days <= 0 || working <= 0) return 0;
  return ROUND_MONEY(basic * (days / working));
}
