import { parseUuid } from "../ids/uuid.js";

/**
 * Strip client-controlled identity fields. Org, auth user, and permission
 * grants come from the session — never from the body.
 * @param {Record<string, unknown> | null | undefined} payload
 */
export function sanitizeEmployeeWritePayload(payload = {}) {
  const raw = payload && typeof payload === "object" ? { ...payload } : {};
  delete raw.org_id;
  delete raw.company_id;
  delete raw.business_id;
  delete raw.user_id;
  delete raw.permissions;
  delete raw.role_permissions;
  return raw;
}

/**
 * Team-list query filters are ignored unless the actor can view the team.
 * @param {Record<string, unknown>} filters
 * @param {boolean} canViewTeam
 */
export function scopedEmployeeListFilters(filters = {}, canViewTeam) {
  if (canViewTeam) return { ...filters };
  return {
    ...filters,
    user_id: undefined,
    membership_id: undefined,
    employee_id: undefined,
    payroll_profile_id: undefined,
  };
}

/**
 * Manager pointer must be a membership UUID in the same org (validated by caller).
 * @param {unknown} raw
 */
export function parseManagerMembershipId(raw) {
  return parseUuid(raw);
}
