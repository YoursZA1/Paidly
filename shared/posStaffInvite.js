/**
 * POS-only staff are still org members (Auth + memberships).
 * Do not add a second till login, JWT, or role table.
 *
 * RBAC role stays `employee`. Scope is `memberships.job_function = pos`.
 * That scope is enforced in permissions, SPA routing, /api, and RLS — not by hiding nav.
 */

export const POS_JOB_FUNCTION = "pos";
export const POS_INVITE_SOURCE = "pos";
export const POS_INVITE_NEXT = "POS";
export const POS_SCOPE = "pos";

/** Till-only grants. Close-shift is allowed so cashiers can cash up their own drawer. */
export const POS_ONLY_PERMISSIONS = Object.freeze([
  "pos_access",
  "pos_sell",
  "pos_close_register",
]);

/** @param {unknown} raw */
export function isPosInviteDest(raw) {
  return String(raw || "").trim().toUpperCase() === POS_INVITE_NEXT;
}

/** @param {unknown} permission */
export function posOnlyStaffHasPermission(permission) {
  return POS_ONLY_PERMISSIONS.includes(String(permission || ""));
}

/**
 * Company (non-POS) invite URL. Query-string `/invite?token=` still validates.
 * @param {string} token
 * @param {string} [origin]
 */
export function companyInvitePath(token, origin = "") {
  const path = `/invite/${encodeURIComponent(String(token || "").trim())}`;
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Dedicated till invite URL. Old `/invite?token=&next=POS` still validates.
 * @param {string} token
 * @param {string} [origin]
 */
export function posInvitePath(token, origin = "") {
  const path = `/pos/invite/${encodeURIComponent(String(token || "").trim())}`;
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Employee + POS function (or explicit source=pos) is a till invite.
 * Function never promotes RBAC; manager/admin with function=pos stay back-office.
 * @param {{ source?: string, role?: string, jobFunction?: string, job_function?: string }} [input]
 */
export function isPosStaffInviteRequest(input = {}) {
  const source = String(input.source || "").trim().toLowerCase();
  if (source === POS_INVITE_SOURCE) return true;
  const role = String(input.role || "").trim().toLowerCase();
  const fn = String(input.jobFunction || input.job_function || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const posFn = fn === POS_JOB_FUNCTION || fn === "cashier" || fn === "till" || fn === "pos_only";
  return posFn && (role === "employee" || role === "");
}

export function isPosInviteUrl(raw) {
  const text = String(raw || "");
  if (/\/pos\/invite\//i.test(text)) return true;
  return /[?&]next=POS\b/i.test(text);
}

/**
 * @param {string} inviteUrl absolute or origin-relative `/invite?token=…`
 * @returns {string}
 */
export function appendPosInviteNext(inviteUrl) {
  const raw = String(inviteUrl || "").trim();
  if (!raw) return raw;
  try {
    const absolute = /^https?:\/\//i.test(raw);
    const parsed = new URL(raw, "https://www.paidly.co.za");
    const token = parsed.searchParams.get("token");
    if (token && /\/invite\/?$/i.test(parsed.pathname)) {
      parsed.pathname = `/pos/invite/${encodeURIComponent(token)}`;
      parsed.search = "";
      if (absolute) return parsed.toString();
      return `${parsed.pathname}`;
    }
    parsed.searchParams.set("next", POS_INVITE_NEXT);
    if (absolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const join = raw.includes("?") ? "&" : "?";
    if (/[?&]next=/i.test(raw) || /\/pos\/invite\//i.test(raw)) return raw;
    return `${raw}${join}next=${POS_INVITE_NEXT}`;
  }
}

/**
 * Invited till cashier: employee + job_function pos. Owners/managers keep back office.
 * @param {{ isOrgOwner?: boolean, companyRole?: string | null, jobFunction?: string | null } | null | undefined} membership
 */
export function isPosOnlyStaff(membership) {
  if (!membership || membership.isOrgOwner === true) return false;
  const role = String(membership.companyRole || membership.membershipRole || "")
    .trim()
    .toLowerCase();
  if (role === "owner" || role === "admin" || role === "manager") return false;
  if (role && role !== "employee") return false;
  const fn = String(membership.jobFunction || membership.job_function || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return fn === POS_JOB_FUNCTION || fn === "cashier" || fn === "till";
}

/**
 * @param {{ isOrgOwner?: boolean, companyRole?: string | null, jobFunction?: string | null } | null | undefined} membership
 * @param {string} permission
 * @param {(role: string, permission: string) => boolean} roleHasPermission
 */
export function membershipGrantsPermission(membership, permission, roleHasPermission) {
  if (isPosOnlyStaff(membership)) return posOnlyStaffHasPermission(permission);
  return Boolean(roleHasPermission?.(membership?.companyRole, permission));
}
