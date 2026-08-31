/**
 * Pure shaping helpers for the role-scoped company dashboard.
 *
 * No imports on purpose: keep this side-effect free so it is unit-testable without pulling in the
 * Supabase / entities client chain.
 */

export const RECENT_LIMIT = 5;

/** Commercial types stored on specialised tables — never counted in hub `documents` queries. */
export const BUSINESS_DOCUMENT_TYPES = Object.freeze(["invoice", "quote", "payslip"]);
export const LEAVE_DOCUMENT_TYPE = "leave_request";
/** Leave statuses that count as awaiting approval. */
export const PENDING_LEAVE_STATUSES = Object.freeze(["pending", "submitted"]);

/** Document types excluded from the member "documents" bucket (counted elsewhere). */
export const NON_MEMBER_DOC_TYPES = Object.freeze([...BUSINESS_DOCUMENT_TYPES, LEAVE_DOCUMENT_TYPE]);

/** Turn a PostgREST `{ data, count }` result into a count/recent/latest summary. */
export function summarizeCountResult(result) {
  const rows = Array.isArray(result?.data) ? result.data : [];
  const count = Number.isFinite(result?.count) ? result.count : rows.length;
  return { count, recent: rows.slice(0, RECENT_LIMIT), latest: rows[0] ?? null };
}

/** Assemble the "my workspace" (self) view model from raw query results. */
export function assembleSelfWorkspaceSummary({ payslips, leave, leavePending, documents } = {}) {
  const leaveSummary = summarizeCountResult(leave);
  return {
    payslips: summarizeCountResult(payslips),
    leave: { ...leaveSummary, pending: Number.isFinite(leavePending) ? leavePending : 0 },
    documents: summarizeCountResult(documents),
  };
}

/** Assemble the company overview (manager/admin) view model. */
export function assembleCompanyWorkspaceSummary({ members, pendingLeave, payslips, documents } = {}) {
  const roster = Array.isArray(members) ? members : [];
  return {
    members: { count: roster.length, roster },
    pendingLeave: Number.isFinite(pendingLeave) ? pendingLeave : 0,
    payslips: Number.isFinite(payslips) ? payslips : 0,
    documents: Number.isFinite(documents) ? documents : 0,
  };
}

/** Build the PostgREST `in.(...)` value list. */
export function postgrestInList(values) {
  return `(${values.join(",")})`;
}
