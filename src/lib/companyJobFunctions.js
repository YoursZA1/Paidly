import {
  COMPANY_ROLES,
  COMPANY_ROLE_LABELS,
  normalizeCompanyRole,
  normalizeJobFunction,
} from "@/lib/companyPermissions";

/** Functional area within the company (separate from RBAC role). */
export const COMPANY_JOB_FUNCTIONS = Object.freeze({
  GENERAL: "general",
  SALES: "sales",
  HR: "hr",
  FINANCE: "finance",
  OPERATIONS: "operations",
  SUPPORT: "support",
  MARKETING: "marketing",
  IT: "it",
});

export const JOB_FUNCTION_OPTIONS = [
  { value: COMPANY_JOB_FUNCTIONS.GENERAL, label: "General" },
  { value: COMPANY_JOB_FUNCTIONS.SALES, label: "Sales" },
  { value: COMPANY_JOB_FUNCTIONS.HR, label: "HR" },
  { value: COMPANY_JOB_FUNCTIONS.FINANCE, label: "Finance" },
  { value: COMPANY_JOB_FUNCTIONS.OPERATIONS, label: "Operations" },
  { value: COMPANY_JOB_FUNCTIONS.SUPPORT, label: "Support" },
  { value: COMPANY_JOB_FUNCTIONS.MARKETING, label: "Marketing" },
  { value: COMPANY_JOB_FUNCTIONS.IT, label: "IT" },
];

export const JOB_FUNCTION_LABELS = Object.freeze(
  Object.fromEntries(JOB_FUNCTION_OPTIONS.map((o) => [o.value, o.label]))
);

export { normalizeJobFunction };

/**
 * Human-readable membership label, e.g. "Sales Manager", "HR Employee", "Admin".
 * @param {string | null | undefined} companyRole
 * @param {string | null | undefined} jobFunction
 */
export function formatCompanyMemberRoleLabel(companyRole, jobFunction) {
  const role = normalizeCompanyRole(companyRole);
  if (role === COMPANY_ROLES.ADMIN) return COMPANY_ROLE_LABELS.admin;

  const roleLabel = COMPANY_ROLE_LABELS[role] || COMPANY_ROLE_LABELS.employee;
  const fn = normalizeJobFunction(jobFunction);
  if (fn === COMPANY_JOB_FUNCTIONS.GENERAL) return roleLabel;

  const fnLabel = JOB_FUNCTION_LABELS[fn] || fn;
  return `${fnLabel} ${roleLabel}`;
}

/** Whether the invite form should collect a job function for this RBAC role. */
export function jobFunctionRequiredForRole(companyRole) {
  const role = normalizeCompanyRole(companyRole);
  return role === COMPANY_ROLES.EMPLOYEE || role === COMPANY_ROLES.MANAGER;
}
