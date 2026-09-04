/** Job-function grants on the existing org role matrix. Not a second role table. */

export const WORKFORCE_EVENT_TYPES = Object.freeze({
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_PORTAL_INVITED: "employee.portal.invited",
  EMPLOYEE_PORTAL_ACTIVATED: "employee.portal.activated",
  EMPLOYEE_LEAVE_APPROVED: "employee.leave_approved",
  EMPLOYEE_LEAVE_REJECTED: "employee.leave_rejected",
});

export const PERMISSION_ALIASES = Object.freeze({
  "employees.view": "view_team_members",
  "employees.create": "manage_employees",
  "employees.update": "manage_employees",
  "employees.delete": "manage_employees",
  "payroll.view": "view_team_payroll_summary",
  "payroll.manage": "manage_payroll",
  "payslips.view": "view_own_payslips",
  "leave.view": "view_own_leave",
  "leave.request": "view_own_leave",
  "leave.approve": "approve_leave",
  "leave.manage": "manage_leave",
  "audit.view": "view_audit_logs",
});

/** Manager + HR / finance extra grants. POS-only staff never receive these. */
export function jobFunctionExtraPermissions(jobFunction, role) {
  const fn = String(jobFunction || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase();
  if (normalizedRole !== "manager") return [];
  if (fn === "hr" || fn === "human_resources") {
    return ["manage_employees", "manage_leave", "approve_leave", "view_team_members"];
  }
  if (fn === "finance") {
    return ["manage_payroll", "view_team_payroll_summary"];
  }
  return [];
}

export function resolvePermissionAlias(permission) {
  const key = String(permission || "").trim();
  return PERMISSION_ALIASES[key] || key;
}

export function membershipCreatedIdempotencyKey(membershipId) {
  return `membership:${String(membershipId || "").trim()}:created`;
}
