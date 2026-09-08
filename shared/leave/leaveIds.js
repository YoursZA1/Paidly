// @ts-check

import { firstQueryString, parseUuid } from "../ids/uuid.js";

const LEAVE_STATUSES = new Set(["draft", "pending", "approved", "rejected", "cancelled"]);

/**
 * @typedef {{
 *   status?: string,
 *   employee_id?: string,
 *   payroll_profile_id?: string,
 *   user_id?: string,
 *   leave_type_id?: string,
 *   department?: string,
 * }} LeaveListFilters
 */

/**
 * Parse leave list query params. Invalid UUIDs (including display names) are dropped
 * so PostgreSQL never sees them.
 *
 * @param {Record<string, unknown> | null | undefined} query
 * @returns {LeaveListFilters}
 */
/**
 * Drop another employee's identifiers unless the actor can view team leave.
 * @param {LeaveListFilters} filters
 * @param {boolean} canViewTeam
 */
export function scopedLeaveListFilters(filters = {}, canViewTeam) {
  if (canViewTeam) return { ...filters };
  return {
    ...filters,
    payroll_profile_id: undefined,
    employee_id: undefined,
    user_id: undefined,
  };
}

export function parseLeaveListFilters(query = {}) {
  const statusRaw = firstQueryString(query.status).toLowerCase();
  const department = firstQueryString(query.department);
  return {
    status: LEAVE_STATUSES.has(statusRaw) ? statusRaw : undefined,
    employee_id: parseUuid(query.employee_id) || undefined,
    payroll_profile_id: parseUuid(query.payroll_profile_id) || undefined,
    user_id: parseUuid(query.user_id) || undefined,
    leave_type_id: parseUuid(query.leave_type_id) || undefined,
    department: department || undefined,
  };
}

/**
 * Scope leave_requests to one person.
 * Prefer payroll_profile_id when the lookup succeeded (covers pre-backfill rows).
 * Fall back to employee_id (memberships.id) when the profile is missing so
 * requests that already store the canonical UUID are not dropped.
 *
 * @param {{
 *   employeeId?: string | null,
 *   profileId?: string | null,
 *   userId?: string | null,
 * }} ids
 * @returns {{ column: "payroll_profile_id" | "employee_id" | "user_id", value: string } | null}
 */
export function leaveRequestEmployeeScope({ employeeId, profileId, userId } = {}) {
  const profile = parseUuid(profileId);
  if (profile) return { column: "payroll_profile_id", value: profile };
  const employee = parseUuid(employeeId);
  if (employee) return { column: "employee_id", value: employee };
  const user = parseUuid(userId);
  if (user) return { column: "user_id", value: user };
  return null;
}

/**
 * Map a PostgREST/Postgres UUID parse failure to a client-safe 400.
 * @param {unknown} error
 */
export function mapLeaveDbError(error) {
  if (!error || typeof error !== "object") return error;
  const msg = String(/** @type {{ message?: unknown }} */ (error).message || "");
  if (!/invalid input syntax for type uuid/i.test(msg)) return error;
  /** @type {Error & { status?: number }} */
  const err = new Error(
    "Invalid employee or leave identifier. Expected a UUID, not a name or employee number."
  );
  err.status = 400;
  return err;
}
