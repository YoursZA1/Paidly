/**
 * South Africa BCEA annual leave: accrue from the employment start date.
 * There is no 3-month waiting period in Paidly leave math or this helper.
 */

import { accrueLeaveDays, yearToDateAccrual } from "./leaveMath.js";
import { johannesburgYmd } from "../payroll/dates.js";

export const SA_ANNUAL_LEAVE_DAYS = 21;
export const SA_ANNUAL_ACCRUAL_METHOD = "monthly";

export function leaveAccruesFromStartDate(employmentStartDate) {
  return Boolean(employmentStartDate);
}

function yearStartIso(iso) {
  const year = String(iso || "").slice(0, 4);
  return year ? `${year}-01-01` : null;
}

export function annualLeaveEligibility(input = {}) {
  const startDate = input.employment_start_date || input.employmentStartDate || null;
  const todayIso = input.todayIso || johannesburgYmd().iso;
  const entitlement = Number(input.annual_entitlement ?? input.annualEntitlement ?? SA_ANNUAL_LEAVE_DAYS) || SA_ANNUAL_LEAVE_DAYS;
  const accrues = leaveAccruesFromStartDate(startDate);
  return {
    accrues_from_start: true,
    waiting_period_days: 0,
    waiting_period_applies: false,
    employment_start_date: startDate,
    eligible: accrues,
    annual_entitlement: entitlement,
    accrual_method: SA_ANNUAL_ACCRUAL_METHOD,
    year_to_date_accrual: accrues && startDate
      ? yearToDateAccrual({
          daysPerYear: entitlement,
          method: SA_ANNUAL_ACCRUAL_METHOD,
          employmentStartIso: startDate,
          yearStartIso: yearStartIso(todayIso),
          asOfIso: todayIso,
        })
      : 0,
    copy: accrues
      ? "Annual leave accrues from the employment start date (21 days per leave year, monthly)."
      : "Set an employment start date to begin annual leave accrual.",
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
