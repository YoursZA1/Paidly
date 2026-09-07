// @ts-check

import { looksLikeEmployeeDisplayLabel, parseUuid } from "../ids/uuid.js";

/**
 * Canonical employee identity is `memberships.id`.
 * Payroll profiles, leave ledgers, and payslips are derived from that record.
 *
 * @typedef {{
 *   id?: unknown,
 *   employee_id?: unknown,
 *   membership_id?: unknown,
 *   payroll_profile_id?: unknown,
 *   user_id?: unknown,
 *   employee_number?: unknown,
 *   full_name?: unknown,
 *   label?: unknown,
 * }} EmployeeIdentityRow
 */

/**
 * Employee UUID (`memberships.id`). Never `user_id`, employee number, display label,
 * or `payroll_profiles.id`.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string | null}
 */
export function canonicalEmployeeId(row) {
  const id =
    parseUuid(row?.employee_id) ||
    parseUuid(row?.membership_id) ||
    parseUuid(row?.id);
  if (!id || looksLikeEmployeeDisplayLabel(id)) return null;
  return id;
}

/**
 * Derived payroll-profile UUID. Ledger FKs only — not the employee selector value.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string | null}
 */
export function payrollProfileIdOf(row) {
  return parseUuid(row?.payroll_profile_id);
}

/**
 * UI-only label. Must never be stored or queried as an id.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string}
 */
export function formatEmployeeLabel(row) {
  const name = String(row?.full_name || row?.label || "").trim() || "Employee";
  const number = String(row?.employee_number || "").trim();
  return number ? `${name} (${number})` : name;
}

/**
 * `<option value>` for employee selectors. Empty string if the row has no employee UUID
 * so HTML cannot fall back to the visible label text.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string}
 */
export function employeeOptionValue(row) {
  return canonicalEmployeeId(row) || "";
}
