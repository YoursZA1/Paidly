import { isWorkforceEmployeeActive } from "./employeeLifecycle.js";

/** Temporary employee-details pass. Not a Paidly password and not a till session. */
export const EMPLOYEE_ACCESS_TTL_SECONDS = 24 * 60 * 60;
export const EMPLOYEE_ACCESS_COOKIE = "paidly_employee_access";
export const EMPLOYEE_ACCESS_REQUEST_LIMIT = 5;

export const EMPLOYEE_ACCESS_SENT_MESSAGE =
  "If that email is on this company's employee records, we sent a link. It expires in 24 hours.";

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeEmploymentEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email || email.length > 254) return "";
  if (/[%_\\]/.test(email)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

/**
 * @param {number} [now]
 * @returns {string}
 */
export function employeeAccessExpiresAt(now = Date.now()) {
  return new Date(now + EMPLOYEE_ACCESS_TTL_SECONDS * 1000).toISOString();
}

/**
 * Seconds left on a grant, capped at 24 hours. Zero when missing or past expiry.
 * @param {unknown} expiresAt
 * @param {number} [now]
 */
export function employeeAccessRemainingSeconds(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(EMPLOYEE_ACCESS_TTL_SECONDS, Math.ceil(ms / 1000));
}

/**
 * Pick the employment record whose stored email matches. Inactive and revoked
 * records are not a match. Prefers a role of employee when several rows share the email.
 * @param {Array<Record<string, unknown>> | null | undefined} rows
 * @param {unknown} email
 */
export function selectPortalMembership(rows, email) {
  const want = normalizeEmploymentEmail(email);
  if (!want) return null;
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
    const invited = normalizeEmploymentEmail(row?.invited_email);
    const profile = normalizeEmploymentEmail(row?.profile_email || row?.email);
    if (invited !== want && profile !== want) return false;
    if (row?.portal_revoked_at) return false;
    return isWorkforceEmployeeActive(row);
  });
  if (!matches.length) return null;
  const employees = matches.filter((row) => String(row.role || "").trim().toLowerCase() === "employee");
  return (employees.length ? employees : matches)[0];
}

/**
 * @param {string} slug
 * @param {string} token
 * @param {string} [origin]
 */
export function employeeAccessLinkPath(slug, token, origin = "") {
  const safeSlug = String(slug || "").trim();
  const safeToken = String(token || "").trim();
  if (!safeSlug || !safeToken) return "";
  const path = `/employee/${encodeURIComponent(safeSlug)}?access=${encodeURIComponent(safeToken)}`;
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}
