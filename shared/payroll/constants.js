/** Canonical payroll / leave timezone. Never use the browser clock for calculations. */
export const PAYROLL_TIMEZONE = "Africa/Johannesburg";

export const PAY_FREQUENCIES = Object.freeze(["monthly", "weekly", "bi_weekly"]);

export const PAY_TYPES = Object.freeze(["monthly_salary", "hourly", "daily", "other"]);

export const EMPLOYMENT_STATUSES = Object.freeze([
  "active",
  "on_leave",
  "suspended",
  "terminated",
]);

export const PAYROLL_PROFILE_STATUSES = Object.freeze(["active", "paused", "excluded"]);

/** Pay-run lifecycle. Finalized/paid rows must not be silently rewritten. */
export const PAY_RUN_STATUSES = Object.freeze([
  "draft",
  "processing",
  "calculated",
  "awaiting_approval",
  "approved",
  "paid",
  "cancelled",
]);

export const PAY_RUN_LOCKED_STATUSES = Object.freeze(["approved", "paid"]);

export const PAY_RUN_TERMINAL_STATUSES = Object.freeze(["paid", "cancelled"]);

export const LEAVE_REQUEST_STATUSES = Object.freeze([
  "draft",
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const LEAVE_ACCRUAL_METHODS = Object.freeze(["annual", "monthly", "none"]);

export const LEAVE_TX_KINDS = Object.freeze([
  "opening",
  "accrual",
  "approved_leave",
  "pending_hold",
  "pending_release",
  "adjustment",
  "reversal",
]);

export const PAYROLL_AUDIT_ACTIONS = Object.freeze([
  "PAY_RUN_CREATED",
  "PAY_RUN_CALCULATED",
  "PAY_RUN_APPROVED",
  "PAY_RUN_FINALIZED",
  "PAY_RUN_PAID",
  "PAY_RUN_CANCELLED",
  "PAYSLIP_GENERATED",
  "PAYSLIP_SENT",
  "LEAVE_SUBMITTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "LEAVE_BALANCE_ADJUSTED",
  "PAYROLL_PROFILE_UPDATED",
  "STATUTORY_RULE_UPDATED",
]);

export const COMPONENT_KINDS = Object.freeze(["earning", "deduction"]);

export const ROUND_MONEY = (value) => Math.round((Number(value) || 0) * 100) / 100;
export const ROUND_DAYS = (value) => Math.round((Number(value) || 0) * 100) / 100;
