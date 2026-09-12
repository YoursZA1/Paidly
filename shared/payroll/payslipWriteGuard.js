// @ts-check

import { parseUuid } from "../ids/uuid.js";

/**
 * Standalone and finalize payslip writes must store memberships.id.
 * Display names and EMP-* numbers are not valid.
 *
 * @param {unknown} payload
 * @returns {string}
 */
export function requirePayslipMembershipId(payload) {
  const id = parseUuid(
    payload && typeof payload === "object" && "membership_id" in payload
      ? /** @type {{ membership_id?: unknown }} */ (payload).membership_id
      : payload
  );
  if (!id) {
    /** @type {Error & { status?: number }} */
    const err = new Error(
      "Payslip writes require membership_id (memberships.id UUID). Display names and employee numbers are not valid."
    );
    err.status = 400;
    throw err;
  }
  return id;
}
