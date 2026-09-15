// @ts-check

import { addDaysIso } from "./dates.js";

/**
 * Org statutory rates are append-only versions. Never rewrite `value` on an existing row.
 * Closing a previous window only sets `effective_to`.
 */

export function assertAppendOnlyStatutoryPayload(payload = {}) {
  if (payload?.id) {
    const err = new Error(
      "Statutory rates cannot be edited in place. Insert a new version with a new effective_from."
    );
    err.status = 400;
    err.code = "STATUTORY_APPEND_ONLY";
    throw err;
  }
}

/**
 * @param {{ effective_from?: unknown, effective_to?: unknown } | null | undefined} previous
 * @param {string} nextFrom
 */
export function supersedeEffectiveTo(previous, nextFrom) {
  const from = String(nextFrom || "").slice(0, 10);
  if (!previous || !from) return null;
  const prevFrom = String(previous.effective_from || "").slice(0, 10);
  if (previous.effective_to) return null;
  if (prevFrom && prevFrom >= from) return null;
  return addDaysIso(from, -1);
}

export function statutoryVersionRow(orgId, payload = {}) {
  return {
    org_id: orgId,
    code: String(payload.code || "").toUpperCase(),
    name: payload.name || payload.code,
    effective_from: payload.effective_from,
    effective_to: payload.effective_to || null,
    calculation_type: payload.calculation_type,
    value: payload.value || {},
    employee_portion: payload.employee_portion !== false,
    employer_portion: Boolean(payload.employer_portion),
  };
}
