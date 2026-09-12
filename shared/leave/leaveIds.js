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
 *   manager_id?: string,
 *   from?: string,
 *   to?: string,
 * }} LeaveListFilters
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
    manager_id: undefined,
    department: undefined,
  };
}

function parseIsoDateParam(value) {
  const raw = firstQueryString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

/**
 * Parse leave list query params. Invalid UUIDs (including display names) are dropped
 * so PostgreSQL never sees them.
 *
 * @param {Record<string, unknown> | null | undefined} query
 * @returns {LeaveListFilters}
 */
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
    manager_id: parseUuid(query.manager_id) || undefined,
    from: parseIsoDateParam(query.from),
    to: parseIsoDateParam(query.to),
  };
}

/**
 * Intersect two employee-id scopes. `null` means unconstrained.
 * @param {string[] | null | undefined} a
 * @param {string[] | null | undefined} b
 * @returns {string[] | null}
 */
export function intersectEmployeeIdLists(a, b) {
  if (!a && !b) return null;
  if (!a) return [...b];
  if (!b) return [...a];
  const allow = new Set(a);
  return b.filter((id) => allow.has(id));
}

/**
 * Scope leave_requests to one person.
 * Prefer employee_id (memberships.id). Fall back to payroll_profile_id for
 * pre-backfill rows, then user_id.
 *
 * @param {{
 *   employeeId?: string | null,
 *   profileId?: string | null,
 *   userId?: string | null,
 * }} ids
 * @returns {{ column: "payroll_profile_id" | "employee_id" | "user_id", value: string } | null}
 */
export function leaveRequestEmployeeScope({ employeeId, profileId, userId } = {}) {
  const employee = parseUuid(employeeId);
  if (employee) return { column: "employee_id", value: employee };
  const profile = parseUuid(profileId);
  if (profile) return { column: "payroll_profile_id", value: profile };
  const user = parseUuid(userId);
  if (user) return { column: "user_id", value: user };
  return null;
}

/**
 * Leave ledger writes must stamp memberships.id. Never strip it on retry.
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @param {string} [table]
 */
export function assertLeaveRowEmployeeId(row, table = "leave") {
  if (parseUuid(row?.employee_id)) return row;
  /** @type {Error & { status?: number }} */
  const err = new Error(
    `Cannot write ${table} without employee_id (memberships.id UUID).`
  );
  err.status = 400;
  throw err;
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
