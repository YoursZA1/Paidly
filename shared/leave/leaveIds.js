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
