import { jobFunctionExtraPermissions, resolvePermissionAlias } from "./workforcePermissions.js";

/**
 * POS-only staff with a Paidly account stay org members (Auth + memberships).
 * POS invites can also issue a scoped POS access-pass session without creating
 * a Paidly account. That pass is not a second role table — permissions still
 * come from the invite's server-side role and job_function.
 *
 * RBAC role stays `employee`. Scope is `memberships.job_function = pos` or a
 * POS access-pass session with the same job_function.
 */

export const POS_JOB_FUNCTION = "pos";
export const POS_INVITE_SOURCE = "pos";
export const POS_INVITE_NEXT = "POS";
export const POS_SCOPE = "pos";

/** HttpOnly cookie + Bearer `pos.` prefix. Not a Paidly Auth JWT. */
export const POS_ACCESS_COOKIE = "paidly_pos_access";
export const POS_ACCESS_BEARER_PREFIX = "pos.";
export const POS_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;

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

/** Dedicated till URL for the business (bookmark / device home). Not an invite token. */
export function posAccessPath(origin = "") {
  const path = "/pos";
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

const TILL_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Register id from `/pos/till/{till-id}`. Empty if the segment is not a UUID. */
export function normalizePosTillId(raw) {
  const id = String(raw || "").trim();
  return TILL_ID_RE.test(id) ? id : "";
}

/**
 * Specific till URL. Knowing this path is not authentication — Auth + pos_access
 * (and POS-only assignment) still apply.
 */
export function posTillPath(tillId, origin = "") {
  const id = normalizePosTillId(tillId);
  if (!id) return posAccessPath(origin);
  const path = `/pos/till/${encodeURIComponent(id)}`;
  const base = String(origin || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/** Backup device activation (typed till code). Not the email CTA. */
export function posJoinPath(origin = "") {
  const path = "/pos/join";
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
  if (/\/pos\/invite\//i.test(text) || /\/pos\/join\/?$/i.test(text)) return true;
  return /[?&]next=POS\b/i.test(text);
}

export function isPosAccessPath(pathname) {
  const p = String(pathname || "");
  return /^\/pos\/?$/i.test(p) || /^\/pos\/till\/[^/]+\/?$/i.test(p);
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
  const resolved = resolvePermissionAlias(permission);
  if (roleHasPermission?.(membership?.companyRole, resolved)) return true;
  const extras = jobFunctionExtraPermissions(
    membership?.jobFunction || membership?.job_function,
    membership?.companyRole
  );
  return extras.includes(resolved);
}
