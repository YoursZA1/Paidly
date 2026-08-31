/**
 * POS-only staff are still org members (Auth + memberships).
 * Do not add a second till login, JWT, or role table.
 *
 * RBAC role stays `employee`. Scope is `memberships.job_function = pos`.
 */

export const POS_JOB_FUNCTION = "pos";
export const POS_INVITE_SOURCE = "pos";
export const POS_INVITE_NEXT = "POS";

/** @param {unknown} raw */
export function isPosInviteDest(raw) {
  return String(raw || "").trim().toUpperCase() === POS_INVITE_NEXT;
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
    parsed.searchParams.set("next", POS_INVITE_NEXT);
    if (absolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const join = raw.includes("?") ? "&" : "?";
    if (/[?&]next=/i.test(raw)) return raw;
    return `${raw}${join}next=${POS_INVITE_NEXT}`;
  }
}

/**
 * Invited till cashier: employee + job_function pos. Owners/managers keep back office.
 * @param {{ isOrgOwner?: boolean, companyRole?: string | null, jobFunction?: string | null } | null | undefined} membership
 */
export function isPosOnlyStaff(membership) {
  if (!membership || membership.isOrgOwner === true) return false;
  const role = String(membership.companyRole || "")
    .trim()
    .toLowerCase();
  if (role !== "employee") return false;
  const fn = String(membership.jobFunction || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return fn === POS_JOB_FUNCTION || fn === "cashier" || fn === "till";
}
