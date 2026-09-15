import { incompletePayRateReason, livePayRate, payrollSetupPath } from "./payRate.js";
import { isPayrollParticipationActive } from "../workforce/employeeLifecycle.js";

/**
 * Validate a pay-run line against the live payroll_profiles row, not the
 * snapshot that may still be 0 after a later salary save.
 */
export function validatePayRunItem(item = {}, liveProfile = null) {
  const profile = liveProfile || item.payroll_profile || {};
  const employeeId = item.membership_id || profile.membership_id || item.employee_id || null;
  const participating = isPayrollParticipationActive({
    ...profile,
    employment_status: item.employment_status || profile.employment_status,
    disabled_at: item.disabled_at || profile.disabled_at,
  });
  if (!participating) {
    return {
      employee_id: item.employee_id || item.id,
      membership_id: employeeId,
      name: item.full_name || item.label || "Employee",
      blocking: false,
      code: "not_participating",
      message: "Not in this pay run (inactive or paused)",
    };
  }
  const rate = livePayRate({
    pay_type: item.pay_type || profile.pay_type,
    base_salary: profile.base_salary ?? item.base_salary,
    hourly_rate: profile.hourly_rate ?? item.hourly_rate,
    daily_rate: profile.daily_rate ?? item.daily_rate,
  });
  if (rate <= 0) {
    return {
      employee_id: item.employee_id || item.id,
      membership_id: employeeId,
      name: item.full_name || item.label || profile.full_name || "Employee",
      blocking: true,
      code: "incomplete_pay_rate",
      message: incompletePayRateReason({
        pay_type: profile.pay_type || item.pay_type,
        base_salary: profile.base_salary ?? item.base_salary,
        hourly_rate: profile.hourly_rate ?? item.hourly_rate,
        daily_rate: profile.daily_rate ?? item.daily_rate,
      }),
      setup_path: payrollSetupPath(employeeId),
      live_pay_rate: rate,
    };
  }
  return null;
}

export function validatePayRunItems(items, liveByMembership = new Map()) {
  const issues = [];
  for (const item of items || []) {
    const membershipId = item.membership_id || item.employee_id;
    const live = membershipId ? liveByMembership.get(membershipId) || null : null;
    const issue = validatePayRunItem(item, live);
    if (issue) issues.push(issue);
  }
  return issues;
}
