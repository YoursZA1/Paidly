/**
 * Soft employment lifecycle on memberships. Identity stays memberships.id.
 * Deactivate never deletes payslips, leave, documents, or manager history.
 */

import { hasCompletePayRate } from "../payroll/payRate.js";

export const INACTIVE_EMPLOYMENT_STATUSES = Object.freeze(["inactive", "terminated", "suspended"]);
export const ACTIVE_EMPLOYMENT_STATUSES = Object.freeze(["active", "on_leave"]);

export function isWorkforceEmployeeActive(row = {}) {
  if (row?.disabled_at) return false;
  const status = String(row.employment_status || "active")
    .trim()
    .toLowerCase();
  return !INACTIVE_EMPLOYMENT_STATUSES.includes(status);
}

export function workforceLifecycleStatus(row = {}) {
  return isWorkforceEmployeeActive(row) ? "active" : "inactive";
}

export function workforceLifecycleLabel(row = {}) {
  return workforceLifecycleStatus(row) === "active" ? "Active" : "Inactive";
}

/**
 * Managers who may receive new reports: active admin / manager (including HR).
 */
export function isEligibleWorkforceManager(membership, { excludeId } = {}) {
  if (!membership?.id) return false;
  if (excludeId && String(membership.id) === String(excludeId)) return false;
  if (!isWorkforceEmployeeActive(membership)) return false;
  const role = String(membership.role || membership.companyRole || membership.membershipRole || "")
    .trim()
    .toLowerCase();
  if (role === "owner" || role === "admin" || role === "manager") return true;
  const job = String(membership.job_function || membership.jobFunction || "")
    .trim()
    .toLowerCase();
  return job === "hr" || job === "human_resources";
}

export function eligibleManagersFromRoster(rows, { excludeId } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    isEligibleWorkforceManager(row, { excludeId })
  );
}

export function managerAssignmentState(row = {}) {
  if (!row.manager_membership_id) return "none";
  if (row.manager_active === false) return "inactive";
  if (row.manager && !isWorkforceEmployeeActive(row.manager)) return "inactive";
  return "assigned";
}

export function managerAssignmentLabel(state) {
  if (state === "inactive") return "Manager inactive";
  if (state === "none") return "No manager";
  return "Manager";
}

export function employeeAttentionReasons(row = {}) {
  const reasons = [];
  const active = isWorkforceEmployeeActive(row);
  if (managerAssignmentState(row) === "inactive") reasons.push("inactive_manager");
  if (active && !row.manager_membership_id) reasons.push("missing_manager");
  if (active && !String(row.department || "").trim()) reasons.push("missing_department");
  if (active && !row.employment_start_date) reasons.push("missing_hr");
  const payrollStatus = String(row.payroll_status || "").toLowerCase();
  if (active && (!payrollStatus || payrollStatus === "unprovisioned")) reasons.push("missing_payroll");
  else if (active && !hasCompletePayRate(row)) reasons.push("incomplete_pay_rate");
  return reasons;
}

export function employeeNeedsAttention(row) {
  return employeeAttentionReasons(row).length > 0;
}

export function attentionReasonLabel(reason) {
  const labels = {
    inactive_manager: "Manager inactive — reassignment required",
    missing_manager: "No manager",
    missing_department: "Missing department",
    missing_hr: "Missing HR information",
    missing_payroll: "Missing payroll profile",
    incomplete_pay_rate: "Incomplete payroll — salary or rate is zero",
  };
  return labels[reason] || String(reason || "");
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {"activate" | "deactivate" | null}
 */
export function normalizeEmploymentLifecycleAction(payload = {}) {
  const action = String(payload.action || "")
    .trim()
    .toLowerCase();
  if (action === "deactivate" || action === "activate") return action;
  const status = String(payload.employment_status || "")
    .trim()
    .toLowerCase();
  if (INACTIVE_EMPLOYMENT_STATUSES.includes(status)) return "deactivate";
  if (status === "active") return "activate";
  return null;
}

export function isPayrollParticipationActive(profile = {}) {
  if (String(profile.payroll_status || "active").toLowerCase() !== "active") return false;
  return isWorkforceEmployeeActive(profile);
}

export function lifecyclePatchForAction(action, { todayIso } = {}) {
  if (action === "deactivate") {
    return {
      employment_status: "inactive",
      disabled_at: new Date().toISOString(),
      employment_end_date: todayIso || null,
    };
  }
  if (action === "activate") {
    return {
      employment_status: "active",
      disabled_at: null,
      employment_end_date: null,
    };
  }
  return {};
}
