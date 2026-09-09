// @ts-check

/**
 * Employee Profile read model. Canonical identity is memberships.id.
 * HR facts come from memberships (+ profiles for person name/email).
 * payroll_profiles is compensation only — never the HR source of truth.
 */

import { canonicalEmployeeId, formatEmployeeLabel, payrollProfileIdOf } from "./employeeIdentity.js";

export const COMPENSATION_FIELDS = Object.freeze([
  "base_salary",
  "hourly_rate",
  "daily_rate",
  "pay_type",
  "banking",
  "tax_identifiers",
]);

/**
 * Payroll managers see all compensation. Employees see their own.
 * Department managers and HR without payroll never see someone else's pay.
 *
 * @param {{ canManagePayroll?: boolean, isSelf?: boolean }} [opts]
 */
export function canSeeEmployeeCompensation(opts = {}) {
  return Boolean(opts.canManagePayroll || opts.isSelf);
}

/**
 * Strip compensation fields unless the actor may see them.
 * Missing keys (not zeros) so clients cannot treat 0 as a salary.
 *
 * @template {Record<string, unknown>} T
 * @param {T | null | undefined} row
 * @param {{ canManagePayroll?: boolean, isSelf?: boolean }} [opts]
 * @returns {T | null | undefined}
 */
export function redactEmployeeCompensation(row, opts = {}) {
  if (!row || typeof row !== "object") return row;
  if (canSeeEmployeeCompensation(opts)) return { ...row };
  const next = { ...row };
  for (const field of COMPENSATION_FIELDS) {
    delete next[field];
  }
  next.compensation_redacted = true;
  return next;
}

/**
 * @param {{
 *   membership?: Record<string, unknown> | null,
 *   profile?: Record<string, unknown> | null,
 *   payrollProfile?: Record<string, unknown> | null,
 * }} parts
 */
export function resolveEmployeeDisplayName(parts = {}) {
  const { membership, profile, payrollProfile } = parts;
  const composed = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return (
    String(profile?.full_name || "").trim() ||
    composed ||
    String(membership?.invited_name || "").trim() ||
    String(profile?.email || "").trim() ||
    String(membership?.invited_email || "").trim() ||
    "Employee"
  );
}

/**
 * @param {{
 *   membership?: Record<string, unknown> | null,
 *   profile?: Record<string, unknown> | null,
 * }} parts
 */
export function resolveEmployeeEmail(parts = {}) {
  const { membership, profile } = parts;
  return String(profile?.email || "").trim() || String(membership?.invited_email || "").trim() || null;
}

/**
 * Shape one employee for list/get APIs. HR columns prefer memberships.
 *
 * @param {{
 *   membership: Record<string, unknown>,
 *   profile?: Record<string, unknown> | null,
 *   payrollProfile?: Record<string, unknown> | null,
 *   attendance?: { status?: string } | null,
 *   leaveAvailable?: number | null,
 *   payslipCount?: number,
 *   manager?: { id?: string, full_name?: string, label?: string } | null,
 * }} input
 * @param {{ canManagePayroll?: boolean, actorMembershipId?: string | null }} [opts]
 */
export function buildEmployeeProfile(input, opts = {}) {
  const membership = input?.membership || {};
  const profile = input?.profile || null;
  const payroll = input?.payrollProfile || null;
  const employeeId = canonicalEmployeeId({
    id: membership.id,
    membership_id: membership.id,
    employee_id: membership.id,
  });
  const email = resolveEmployeeEmail({ membership, profile });
  const name = resolveEmployeeDisplayName({ membership, profile, payrollProfile: payroll });
  const isSelf = Boolean(opts.actorMembershipId && employeeId && opts.actorMembershipId === employeeId);
  const row = {
    id: employeeId,
    employee_id: employeeId,
    membership_id: employeeId,
    payroll_profile_id: payrollProfileIdOf({ payroll_profile_id: payroll?.id }) || payroll?.id || null,
    user_id: membership.user_id || null,
    role: membership.role || null,
    job_function: membership.job_function || null,
    employee_number: membership.employee_number || null,
    department: membership.department || null,
    job_title: membership.job_title || profile?.job_title || null,
    employment_status: membership.employment_status || "active",
    employment_start_date: membership.employment_start_date || null,
    employment_end_date: membership.employment_end_date || null,
    manager_membership_id: membership.manager_membership_id || null,
    manager_name: input.manager?.full_name || input.manager?.label || null,
    email,
    phone: profile?.phone || null,
    full_name: String(profile?.full_name || membership.invited_name || "").trim() || null,
    invited_email: membership.invited_email || null,
    invited_name: membership.invited_name || null,
    base_salary: payroll?.base_salary ?? 0,
    hourly_rate: payroll?.hourly_rate ?? 0,
    daily_rate: payroll?.daily_rate ?? 0,
    pay_type: payroll?.pay_type || "monthly_salary",
    pay_frequency: payroll?.pay_frequency || "monthly",
    payroll_status: payroll?.payroll_status || (payroll?.id ? "active" : "unprovisioned"),
    label: formatEmployeeLabel({ full_name: name, employee_number: membership.employee_number }),
    attendance_status: input.attendance?.status || (payroll?.id ? "active" : "unprovisioned"),
    leave_available: input.leaveAvailable ?? null,
    payslip_count: Number(input.payslipCount) || 0,
    portal_status: membership.user_id ? "active" : "invited",
    disabled_at: membership.disabled_at || null,
    created_at: membership.created_at || null,
  };
  return redactEmployeeCompensation(row, {
    canManagePayroll: opts.canManagePayroll,
    isSelf,
  });
}
