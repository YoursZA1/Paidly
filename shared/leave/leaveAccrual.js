/**
 * Single annual-leave accrual calculation.
 * Accrued leave is the configured entitlement multiplied by the fraction of the
 * current leave cycle that has elapsed. The cycle starts on the employment
 * anniversary unless a company-wide cycle anchor is supplied.
 */

import { ROUND_DAYS } from "../payroll/constants.js";
import { addDaysIso, compareIsoDate, daysInMonth, formatIsoDate, parseIsoDate } from "../payroll/dates.js";

export const SA_ANNUAL_WORKING_DAYS = 15;

function calendarDaysInclusive(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || compareIsoDate(endIso, startIso) < 0) return 0;
  const from = Date.UTC(start.year, start.month - 1, start.day);
  const to = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((to - from) / 86400000) + 1;
}

function addYearsClamped(iso, years) {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const year = parsed.year + years;
  const day = Math.min(parsed.day, daysInMonth(year, parsed.month));
  return formatIsoDate(year, parsed.month, day);
}

function earlierIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return compareIsoDate(a, b) <= 0 ? a : b;
}

/**
 * Leave cycle that contains asOf.
 * Default anchor is the employment anniversary.
 * `cycleStartMonth` (1–12) selects a company-wide cycle instead, starting on that month and day.
 */
export function leaveCycleContaining(employmentStartIso, asOfIso, { cycleStartMonth = null, cycleStartDay = 1 } = {}) {
  const start = parseIsoDate(employmentStartIso);
  const asOf = parseIsoDate(asOfIso);
  if (!start || !asOf) return null;

  const companyMonth = Number(cycleStartMonth);
  const useCompanyCycle = companyMonth >= 1 && companyMonth <= 12;
  const anchorDay = useCompanyCycle
    ? Math.min(Math.max(1, Number(cycleStartDay) || 1), daysInMonth(start.year, companyMonth))
    : start.day;
  const anchorMonth = useCompanyCycle ? companyMonth : start.month;

  let year = asOf.year;
  let cycleStart = formatIsoDate(year, anchorMonth, Math.min(anchorDay, daysInMonth(year, anchorMonth)));
  if (compareIsoDate(asOfIso, cycleStart) < 0) {
    year -= 1;
    cycleStart = formatIsoDate(year, anchorMonth, Math.min(anchorDay, daysInMonth(year, anchorMonth)));
  }
  if (!useCompanyCycle && compareIsoDate(cycleStart, employmentStartIso) < 0) {
    cycleStart = employmentStartIso;
  }
  const next = addYearsClamped(cycleStart, 1);
  const cycleEnd = addDaysIso(next, -1);
  return {
    cycleStart,
    cycleEnd,
    cycleDays: calendarDaysInclusive(cycleStart, cycleEnd),
  };
}

export function formatLeaveCycle(cycleStart, cycleEnd) {
  const label = (iso) => {
    const parsed = parseIsoDate(iso);
    if (!parsed) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12)));
  };
  if (!cycleStart || !cycleEnd) return "";
  return `${label(cycleStart)} – ${label(cycleEnd)}`;
}

/**
 * Approved and pending working days whose request starts inside the cycle.
 * Historical request rows are read, not rewritten.
 */
export function usageInCycle(requests, { cycleStart, cycleEnd, leaveTypeId } = {}) {
  let used = 0;
  let pending = 0;
  if (!cycleStart || !cycleEnd) return { used: 0, pending: 0 };
  for (const row of requests || []) {
    const typeId = row.leave_type_id || row.leave_types?.id || null;
    if (leaveTypeId && typeId && typeId !== leaveTypeId) continue;
    const start = String(row.start_date || "").slice(0, 10);
    if (!start || compareIsoDate(start, cycleStart) < 0 || compareIsoDate(start, cycleEnd) > 0) continue;
    const days = Number(row.working_days) || 0;
    const status = String(row.status || "").toLowerCase();
    if (status === "approved") used += days;
    else if (status === "pending") pending += days;
  }
  return { used: ROUND_DAYS(used), pending: ROUND_DAYS(pending) };
}

/**
 * @param {{
 *   employmentStartIso?: string | null,
 *   employmentEndIso?: string | null,
 *   employmentStatus?: string | null,
 *   annualEntitlement?: number,
 *   used?: number,
 *   pending?: number,
 *   adjustments?: number,
 *   daysPerWeek?: number | null,
 *   cycleStartMonth?: number | null,
 *   cycleStartDay?: number | null,
 * }} employee
 * @param {string} asOfDate YYYY-MM-DD
 */
export function calculateLeaveAccrual(employee = {}, asOfDate) {
  const startIso = employee.employmentStartIso || employee.employment_start_date || null;
  const entitlement = Number(employee.annualEntitlement ?? employee.annual_entitlement ?? employee.daysPerYear) || 0;
  const adjustments = ROUND_DAYS(employee.adjustments || 0);
  const used = ROUND_DAYS(employee.used || 0);
  const pending = ROUND_DAYS(employee.pending || 0);
  const asOfIso = String(asOfDate || "").slice(0, 10);
  const ended = String(employee.employmentStatus || employee.employment_status || "").toLowerCase() === "terminated";
  const effectiveAsOf = earlierIso(asOfIso, ended ? employee.employmentEndIso || employee.employment_end_date : null) || asOfIso;

  if (!startIso || !parseIsoDate(startIso) || !parseIsoDate(effectiveAsOf)) {
    return {
      entitlement: ROUND_DAYS(entitlement),
      cycleStart: null,
      cycleEnd: null,
      cycleLabel: "",
      elapsedDays: 0,
      cycleDays: 0,
      accrued: 0,
      adjustments,
      used,
      pending,
      available: ROUND_DAYS(adjustments - used - pending),
      note: "Set an employment start date to begin annual leave accrual.",
    };
  }

  const cycle = leaveCycleContaining(startIso, effectiveAsOf, {
    cycleStartMonth: employee.cycleStartMonth,
    cycleStartDay: employee.cycleStartDay,
  });
  const elapsedDays = !cycle || compareIsoDate(effectiveAsOf, cycle.cycleStart) < 0
    ? 0
    : calendarDaysInclusive(cycle.cycleStart, earlierIso(effectiveAsOf, cycle.cycleEnd));
  const cycleDays = cycle?.cycleDays || 0;
  let accrued = cycleDays > 0 ? ROUND_DAYS(entitlement * Math.min(1, elapsedDays / cycleDays)) : 0;
  const perWeek = Number(employee.daysPerWeek);
  if (Number.isFinite(perWeek) && perWeek > 0 && perWeek < 5) {
    accrued = ROUND_DAYS(accrued * (perWeek / 5));
  }

  return {
    entitlement: ROUND_DAYS(entitlement),
    cycleStart: cycle?.cycleStart || null,
    cycleEnd: cycle?.cycleEnd || null,
    cycleLabel: formatLeaveCycle(cycle?.cycleStart, cycle?.cycleEnd),
    elapsedDays,
    cycleDays,
    accrued,
    adjustments,
    used,
    pending,
    available: ROUND_DAYS(accrued + adjustments - used - pending),
    note: "Annual leave accumulates from the employment start date.",
  };
}
