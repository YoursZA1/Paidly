/**
 * South Africa BCEA leave during the first months of employment.
 * Annual leave accrues from the start date. Family responsibility leave
 * waits 4 months. Sick leave in the first 6 months is 1 day per 26 days worked.
 */

import { accrueLeaveDays, computeLeaveBalance, countWorkingDays, yearToDateAccrual } from "./leaveMath.js";
import { calculateLeaveAccrual, usageInCycle } from "./leaveAccrual.js";
import { compareIsoDate, johannesburgYmd, parseIsoDate } from "../payroll/dates.js";
import { ROUND_DAYS } from "../payroll/constants.js";

export const SA_ANNUAL_LEAVE_DAYS = 15;
export const SA_ANNUAL_ACCRUAL_METHOD = "monthly";
export const SA_FAMILY_QUALIFYING_MONTHS = 4;
export const SA_FAMILY_MIN_DAYS_PER_WEEK = 4;
export const SA_SICK_QUALIFYING_MONTHS = 6;
export const SA_SICK_DAYS_WORKED_PER_DAY = 26;

export const FAMILY_RESPONSIBILITY_BLOCKED =
  "Family responsibility leave starts after 4 months of employment, and only when you work at least 4 days a week. Until then, use annual leave you have already accumulated, sick leave if you are ill, or unpaid leave.";

export function leaveAccruesFromStartDate(employmentStartDate) {
  return Boolean(employmentStartDate);
}

export function annualLeaveEligibility(input = {}) {
  const startDate = input.employment_start_date || input.employmentStartDate || null;
  const todayIso = input.todayIso || johannesburgYmd().iso;
  const entitlement = Number(input.annual_entitlement ?? input.annualEntitlement ?? SA_ANNUAL_LEAVE_DAYS) || SA_ANNUAL_LEAVE_DAYS;
  const accrues = leaveAccruesFromStartDate(startDate);
  const accrual = calculateLeaveAccrual({
    employmentStartIso: startDate,
    annualEntitlement: entitlement,
  }, todayIso);
  return {
    accrues_from_start: true,
    waiting_period_days: 0,
    waiting_period_applies: false,
    employment_start_date: startDate,
    eligible: accrues,
    annual_entitlement: entitlement,
    accrual_method: SA_ANNUAL_ACCRUAL_METHOD,
    year_to_date_accrual: accrues ? accrual.accrued : 0,
    cycle_start: accrual.cycleStart,
    cycle_end: accrual.cycleEnd,
    copy: accrual.note,
  };
}

/** Completed calendar months from the employment start date to asOf. */
export function monthsEmployed(startIso, asOfIso) {
  const start = parseIsoDate(startIso);
  const asOf = parseIsoDate(asOfIso);
  if (!start || !asOf || compareIsoDate(asOfIso, startIso) < 0) return 0;
  let months = (asOf.year - start.year) * 12 + (asOf.month - start.month);
  if (asOf.day < start.day) months -= 1;
  return Math.max(0, months);
}

/**
 * Weekdays worked since the start date, scaled when the week is shorter than 5 days.
 * Unknown schedules are treated as a 5-day week.
 */
export function estimateDaysWorked(startIso, asOfIso, daysPerWeek = 5) {
  if (!startIso || !asOfIso || compareIsoDate(asOfIso, startIso) < 0) return 0;
  const weekdays = countWorkingDays(startIso, asOfIso);
  const perWeek = Number(daysPerWeek);
  const days = Number.isFinite(perWeek) && perWeek > 0 ? Math.min(perWeek, 7) : 5;
  return ROUND_DAYS(weekdays * (days / 5));
}

/**
 * Statutory position for a leave type. `storedAccrued` is the ledger figure.
 * Omit it when opening a new balance so the statutory amount is calculated.
 */
export function bceaLeavePosition({
  code,
  daysPerYear = 0,
  method = "annual",
  employmentStartIso,
  employmentEndIso,
  asOfIso,
  yearStartIso,
  employmentStatus = "active",
  daysPerWeek,
  storedAccrued,
} = {}) {
  const normalized = String(code || "").toUpperCase();
  const base = storedAccrued == null
    ? yearToDateAccrual({
        daysPerYear,
        method,
        employmentStartIso,
        yearStartIso,
        asOfIso,
        employmentStatus,
      })
    : ROUND_DAYS(storedAccrued);

  if (normalized === "ANNUAL") {
    const accrual = calculateLeaveAccrual({
      employmentStartIso,
      employmentEndIso: employmentEndIso,
      employmentStatus,
      annualEntitlement: daysPerYear,
      daysPerWeek,
    }, asOfIso);
    return {
      accrued: accrual.accrued,
      blocked: false,
      message: null,
      note: accrual.note,
      cycleStart: accrual.cycleStart,
      cycleEnd: accrual.cycleEnd,
      cycleLabel: accrual.cycleLabel,
    };
  }

  if (normalized === "FAMILY") {
    const months = monthsEmployed(employmentStartIso, asOfIso);
    const perWeek = daysPerWeek == null || daysPerWeek === "" ? 5 : Number(daysPerWeek);
    const daysOk = Number.isFinite(perWeek) && perWeek >= SA_FAMILY_MIN_DAYS_PER_WEEK;
    const timeOk = Boolean(employmentStartIso) && months >= SA_FAMILY_QUALIFYING_MONTHS;
    if (!timeOk || !daysOk) {
      return {
        accrued: 0,
        blocked: true,
        message: FAMILY_RESPONSIBILITY_BLOCKED,
        note: "Available after 4 months, if you work at least 4 days a week.",
      };
    }
    return {
      accrued: base,
      blocked: false,
      message: null,
      note: "3 paid days per leave cycle, after 4 months of employment.",
    };
  }

  if (normalized === "SICK") {
    if (!employmentStartIso) {
      return {
        accrued: 0,
        blocked: false,
        message: null,
        note: "Set an employment start date to calculate sick leave.",
      };
    }
    if (monthsEmployed(employmentStartIso, asOfIso) < SA_SICK_QUALIFYING_MONTHS) {
      const earned = ROUND_DAYS(
        estimateDaysWorked(employmentStartIso, asOfIso, daysPerWeek ?? 5) / SA_SICK_DAYS_WORKED_PER_DAY
      );
      return {
        accrued: ROUND_DAYS(Math.min(base, earned)),
        blocked: false,
        message: null,
        note: "In the first 6 months, paid sick leave is 1 day for every 26 days worked.",
      };
    }
    return { accrued: base, blocked: false, message: null, note: null };
  }

  return { accrued: base, blocked: false, message: null, note: null };
}

/**
 * Display balance for every leave type. Annual leave always uses calculateLeaveAccrual.
 * Sick leave and family responsibility keep their own rules.
 */
export function presentLeaveBalance(input = {}) {
  const code = String(input.code || "").toUpperCase();
  if (code === "ANNUAL") {
    const cycle = input.employmentStartIso
      ? calculateLeaveAccrual({
          employmentStartIso: input.employmentStartIso,
          employmentEndIso: input.employmentEndIso,
          employmentStatus: input.employmentStatus,
          annualEntitlement: input.daysPerYear,
          daysPerWeek: input.daysPerWeek,
          cycleStartMonth: input.cycleStartMonth,
        }, input.asOfIso)
      : null;
    const usage = Array.isArray(input.requests)
      ? usageInCycle(input.requests, {
          cycleStart: cycle?.cycleStart,
          cycleEnd: cycle?.cycleEnd,
          leaveTypeId: input.leaveTypeId,
        })
      : { used: Number(input.used) || 0, pending: Number(input.pending) || 0 };
    return calculateLeaveAccrual({
      employmentStartIso: input.employmentStartIso,
      employmentEndIso: input.employmentEndIso,
      employmentStatus: input.employmentStatus,
      annualEntitlement: input.daysPerYear,
      daysPerWeek: input.daysPerWeek,
      cycleStartMonth: input.cycleStartMonth,
      used: usage.used,
      pending: usage.pending,
      adjustments: input.adjustments,
    }, input.asOfIso);
  }

  const position = bceaLeavePosition({
    code,
    daysPerYear: input.daysPerYear,
    method: input.method,
    employmentStartIso: input.employmentStartIso,
    employmentEndIso: input.employmentEndIso,
    asOfIso: input.asOfIso,
    yearStartIso: input.yearStartIso,
    employmentStatus: input.employmentStatus,
    daysPerWeek: input.daysPerWeek,
    storedAccrued: input.storedAccrued,
  });
  const computed = computeLeaveBalance({
    entitled: input.daysPerYear,
    accrued: position.accrued,
    used: input.used,
    pending: input.pending,
  });
  return {
    ...computed,
    adjustments: 0,
    cycleStart: null,
    cycleEnd: null,
    cycleLabel: "",
    note: position.note,
    blocked: position.blocked,
    message: position.message,
  };
}

export function previewAccrualFromStart({
  annualEntitlement = SA_ANNUAL_LEAVE_DAYS,
  startDate,
  asOfIso,
  method = SA_ANNUAL_ACCRUAL_METHOD,
} = {}) {
  if (!startDate) return 0;
  return accrueLeaveDays({
    daysPerYear: annualEntitlement,
    method,
    employmentStartIso: startDate,
    asOfIso,
  });
}
