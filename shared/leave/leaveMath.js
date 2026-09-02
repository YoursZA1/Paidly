import { eachIsoDateInclusive, isWeekendIso, parseIsoDate, compareIsoDate } from "../payroll/dates.js";
import { ROUND_DAYS } from "../payroll/constants.js";

/**
 * Count working days between two ISO dates (inclusive).
 * Weekends are excluded when `excludeWeekends` is true (default).
 * `holidayIsos` is reserved for configured public holidays (not hardcoded).
 *
 * @param {string} startIso
 * @param {string} endIso
 * @param {{ excludeWeekends?: boolean, holidayIsos?: string[], halfDay?: boolean }} [opts]
 */
export function countWorkingDays(startIso, endIso, opts = {}) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return 0;
  if (compareIsoDate(endIso, startIso) < 0) return 0;

  const excludeWeekends = opts.excludeWeekends !== false;
  const holidays = new Set((opts.holidayIsos || []).map((d) => String(d).slice(0, 10)));
  const days = eachIsoDateInclusive(startIso, endIso);
  let count = 0;
  for (const iso of days) {
    if (excludeWeekends && isWeekendIso(iso)) continue;
    if (holidays.has(iso)) continue;
    count += 1;
  }
  if (opts.halfDay && startIso === endIso && count > 0) {
    return 0.5;
  }
  return ROUND_DAYS(count);
}

/**
 * Monthly accrual: days_per_year / 12, prorated from employment start.
 * @param {{
 *   daysPerYear: number,
 *   method: string,
 *   employmentStartIso?: string,
 *   asOfIso: string,
 *   employmentStatus?: string,
 * }} input
 */
export function accrueLeaveDays({
  daysPerYear,
  method,
  employmentStartIso,
  asOfIso,
  employmentStatus = "active",
}) {
  if (employmentStatus === "terminated" || employmentStatus === "suspended") {
    return 0;
  }
  const entitled = Number(daysPerYear) || 0;
  const m = String(method || "annual").toLowerCase();
  if (m === "none") return 0;
  if (m === "annual") return ROUND_DAYS(entitled);

  const monthly = entitled / 12;
  if (!employmentStartIso) return ROUND_DAYS(monthly);

  const start = parseIsoDate(employmentStartIso);
  const asOf = parseIsoDate(asOfIso);
  if (!start || !asOf) return ROUND_DAYS(monthly);

  const startMonths = start.year * 12 + (start.month - 1);
  const asOfMonths = asOf.year * 12 + (asOf.month - 1);
  if (asOfMonths < startMonths) return 0;

  const monthsElapsed = asOfMonths - startMonths;
  if (monthsElapsed === 0) {
    const dim = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
    const fraction = Math.max(0, (dim - start.day + 1) / dim);
    return ROUND_DAYS(monthly * fraction);
  }
  return ROUND_DAYS(monthly);
}

export function yearToDateAccrual({
  daysPerYear,
  method,
  employmentStartIso,
  yearStartIso,
  asOfIso,
  employmentStatus = "active",
}) {
  if (employmentStatus === "terminated") return 0;
  const entitled = Number(daysPerYear) || 0;
  const m = String(method || "annual").toLowerCase();
  if (m === "none") return 0;
  if (m === "annual") {
    if (!employmentStartIso || compareIsoDate(employmentStartIso, yearStartIso) <= 0) {
      return ROUND_DAYS(entitled);
    }
    const start = parseIsoDate(employmentStartIso);
    const yearEnd = parseIsoDate(asOfIso);
    if (!start || !yearEnd) return ROUND_DAYS(entitled);
    const months = Math.max(0, (yearEnd.year - start.year) * 12 + (yearEnd.month - start.month) + 1);
    return ROUND_DAYS((entitled / 12) * Math.min(12, months));
  }

  const start = parseIsoDate(employmentStartIso && compareIsoDate(employmentStartIso, yearStartIso) > 0 ? employmentStartIso : yearStartIso);
  const asOf = parseIsoDate(asOfIso);
  if (!start || !asOf) return 0;
  let total = 0;
  let y = start.year;
  let mo = start.month;
  const endMonths = asOf.year * 12 + asOf.month;
  let guard = 0;
  while (y * 12 + mo <= endMonths && guard < 24) {
    const iso = `${y}-${String(mo).padStart(2, "0")}-01`;
    total += accrueLeaveDays({
      daysPerYear: entitled,
      method: "monthly",
      employmentStartIso: employmentStartIso || iso,
      asOfIso: iso,
      employmentStatus,
    });
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
    guard += 1;
  }
  return ROUND_DAYS(total);
}

/**
 * Canonical balance: available = accrued - used - pending.
 * Entitled is policy allocation for the leave year (not a mutation target).
 */
export function computeLeaveBalance({ entitled = 0, accrued = 0, used = 0, pending = 0, maxBalance = null }) {
  let nextAccrued = ROUND_DAYS(accrued);
  if (maxBalance != null && Number.isFinite(Number(maxBalance))) {
    nextAccrued = Math.min(nextAccrued, Number(maxBalance));
  }
  const available = ROUND_DAYS(nextAccrued - used - pending);
  return {
    entitled: ROUND_DAYS(entitled),
    accrued: nextAccrued,
    used: ROUND_DAYS(used),
    pending: ROUND_DAYS(pending),
    available,
  };
}
