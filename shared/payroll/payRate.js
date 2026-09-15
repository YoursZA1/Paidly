/**
 * Live pay-rate completeness. A payroll_profiles.base_salary DEFAULT 0
 * is not a salary — callers must not treat 0 as complete compensation.
 */

export const INCOMPLETE_PAY_RATE = "incomplete_pay_rate";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function payTypeOf(profile = {}) {
  return String(profile.pay_type || "monthly_salary")
    .trim()
    .toLowerCase();
}

/**
 * Amount that actually drives payroll for this pay type.
 * Hourly/daily employees may have base_salary 0 and still be complete.
 */
export function livePayRate(profile = {}) {
  const type = payTypeOf(profile);
  if (type === "hourly") return num(profile.hourly_rate);
  if (type === "daily") return num(profile.daily_rate);
  return num(profile.base_salary);
}

export function hasCompletePayRate(profile = {}) {
  if (!profile || typeof profile !== "object") return false;
  if (!profile.id && profile.payroll_status === "unprovisioned") return false;
  return livePayRate(profile) > 0;
}

export function incompletePayRateReason(profile = {}) {
  if (hasCompletePayRate(profile)) return null;
  const type = payTypeOf(profile);
  if (type === "hourly") return "Hourly rate is missing or zero";
  if (type === "daily") return "Daily rate is missing or zero";
  return "Base salary is zero";
}

export function payrollSetupPath(employeeId) {
  const id = String(employeeId || "").trim();
  return id ? `/employees/${id}?tab=payroll` : "/employees";
}
