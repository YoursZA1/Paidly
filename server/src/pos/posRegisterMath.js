/** Pure POS register helpers — unit-tested, no I/O. */

import { findConflictingRegister, registerNameKey } from "../../../shared/posRegisters.js";

export { findConflictingRegister, registerNameKey };

export const POS_REGISTER_STATUSES = Object.freeze(["active", "disabled"]);

const MAX_NAME = 80;
const MAX_FLOAT = 10_000_000;

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizeRegisterName(raw) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Register name is required", code: "NAME_REQUIRED" };
  if (name.length > MAX_NAME) {
    return { ok: false, error: `Name cannot exceed ${MAX_NAME} characters`, code: "NAME_TOO_LONG" };
  }
  return { ok: true, name };
}

export function normalizeRegisterStatus(raw, { required = false } = {}) {
  if (raw == null || String(raw).trim() === "") {
    if (required) return { ok: false, error: "Status is required", code: "STATUS_REQUIRED" };
    return { ok: true, status: undefined };
  }
  const status = String(raw).trim().toLowerCase();
  if (!POS_REGISTER_STATUSES.includes(status)) {
    return { ok: false, error: "Status must be active or disabled", code: "STATUS_INVALID" };
  }
  return { ok: true, status };
}

export function normalizeOpeningBalance(raw, { required = false } = {}) {
  if (raw == null || raw === "") {
    if (required) return { ok: false, error: "Opening balance is required", code: "FLOAT_REQUIRED" };
    return { ok: true, opening_balance: undefined };
  }
  const n = roundMoney(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Opening balance cannot be negative", code: "FLOAT_INVALID" };
  }
  if (n > MAX_FLOAT) {
    return { ok: false, error: "Opening balance is too large", code: "FLOAT_TOO_LARGE" };
  }
  return { ok: true, opening_balance: n };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ partial?: boolean }} [opts]
 */
export function normalizeRegisterWrite(body, opts = {}) {
  const partial = !!opts.partial;
  const out = {};

  if (!partial || body.name != null) {
    const name = normalizeRegisterName(body.name);
    if (!name.ok) return name;
    out.name = name.name;
  }

  if (!partial || body.status != null) {
    const status = normalizeRegisterStatus(body.status, { required: !partial });
    if (!status.ok) return status;
    if (status.status != null) out.status = status.status;
    else if (!partial) out.status = "active";
  }

  if (!partial || body.opening_balance != null) {
    const float = normalizeOpeningBalance(body.opening_balance, { required: false });
    if (!float.ok) return float;
    if (float.opening_balance != null) out.opening_balance = float.opening_balance;
    else if (!partial) out.opening_balance = 0;
  }

  if (Object.prototype.hasOwnProperty.call(body, "company_id") || !partial) {
    const companyId = body.company_id == null || body.company_id === "" ? null : String(body.company_id).trim();
    out.company_id = companyId || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "assigned_staff_id") || !partial) {
    const staffId =
      body.assigned_staff_id == null || body.assigned_staff_id === ""
        ? null
        : String(body.assigned_staff_id).trim();
    out.assigned_staff_id = staffId || null;
  }

  return { ok: true, data: out };
}

export function publicRegisterView(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    company_id: row.company_id || null,
    company_name: extras.company_name || null,
    name: row.name,
    status: row.status || "active",
    assigned_staff_id: row.assigned_staff_id || null,
    assigned_staff_name: extras.assigned_staff_name || null,
    assigned_staff_email: extras.assigned_staff_email || null,
    opening_balance: roundMoney(row.opening_balance),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * POS-only staff may only use the till stored on memberships.pos_register_id.
 * Owners/managers keep full till choice. Client-submitted till ids are ignored when locked.
 */
export function resolveAssignedTill(membership, requestedRegisterId) {
  const requested = requestedRegisterId || null;
  const posOnly =
    membership &&
    membership.isOrgOwner !== true &&
    String(membership.companyRole || membership.membershipRole || "").toLowerCase() === "employee" &&
    ["pos", "cashier", "till"].includes(
      String(membership.jobFunction || membership.job_function || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
    );
  if (!posOnly) return { ok: true, registerId: requested, locked: false };

  const assigned = membership.posRegisterId || membership.pos_register_id || null;
  if (!assigned) return { ok: true, registerId: requested, locked: false };
  if (requested && requested !== assigned) {
    return { ok: false, error: "This till is not assigned to you", code: "TILL_FORBIDDEN" };
  }
  return { ok: true, registerId: assigned, locked: true };
}

export function filterRegistersForMembership(membership, registers) {
  const list = Array.isArray(registers) ? registers : [];
  const resolved = resolveAssignedTill(membership, null);
  if (!resolved.locked || !resolved.registerId) return list;
  return list.filter((row) => row?.id === resolved.registerId);
}
