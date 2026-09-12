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
 * True when the row is an issued/draft payslip, not a membership or leave row.
 * `payslips.employee_id` is the printed number; `payslips.id` is the document id.
 */
export function isPayslipIdentityRow(row) {
  if (!row || typeof row !== "object") return false;
  return Boolean(
    row.payslip_number ||
      row.pay_run_id ||
      row.pay_run_item_id ||
      row.pay_period_start ||
      row.pay_period_end
  );
}

/**
 * Human-readable employee number (`EMP-002`). Never a UUID.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string}
 */
export function printedEmployeeNumber(row) {
  const fromNumber = String(row?.employee_number || "").trim();
  if (fromNumber && !parseUuid(fromNumber)) return fromNumber;
  const raw = String(row?.employee_id || "").trim();
  if (!raw || parseUuid(raw)) return fromNumber;
  const nested = raw.match(/\((EMP-\d+)\)/i);
  if (nested) return String(nested[1]).toUpperCase();
  if (looksLikeEmployeeDisplayLabel(raw) || /^EMP-/i.test(raw)) return raw;
  return fromNumber;
}

/**
 * Employee UUID (`memberships.id`). Never `user_id`, employee number, display label,
 * `payroll_profiles.id`, or a payslip document id.
 *
 * Prefer `membership_id` over `employee_id` so payslip rows (printed number in
 * `employee_id`) cannot be persisted or queried as a UUID.
 *
 * @param {EmployeeIdentityRow | null | undefined} row
 * @returns {string | null}
 */
export function canonicalEmployeeId(row) {
  const fromMembership = parseUuid(row?.membership_id);
  if (fromMembership && !looksLikeEmployeeDisplayLabel(fromMembership)) {
    return fromMembership;
  }

  const payslipRow = isPayslipIdentityRow(row);
  const fromEmployeeId = parseUuid(row?.employee_id);
  if (fromEmployeeId && !looksLikeEmployeeDisplayLabel(fromEmployeeId) && !payslipRow) {
    return fromEmployeeId;
  }

  if (payslipRow) return null;

  const fromId = parseUuid(row?.id);
  if (!fromId || looksLikeEmployeeDisplayLabel(fromId)) return null;
  return fromId;
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
