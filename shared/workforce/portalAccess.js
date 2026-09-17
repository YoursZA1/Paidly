// @ts-check

/**
 * Employee portal access status derived from memberships + company_invites.
 * Canonical identity remains memberships.id — no second portal account table.
 * Distinct from POS access (till link + PIN).
 */

/**
 * @typedef {{
 *   user_id?: unknown,
 *   portal_revoked_at?: unknown,
 * }} PortalMembershipFields
 *
 * @typedef {{
 *   status?: unknown,
 *   revoked_at?: unknown,
 *   expires_at?: unknown,
 * }} PortalInviteRow
 */

export const PORTAL_STATUS = Object.freeze({
  NOT_ACTIVATED: "not_activated",
  /** @deprecated use NOT_ACTIVATED — kept for older API clients */
  NOT_INVITED: "not_activated",
  INVITATION_SENT: "invitation_sent",
  ACTIVATED: "activated",
  EXPIRED: "expired",
  REVOKED: "revoked",
});

export const PORTAL_STATUS_LABELS = Object.freeze({
  not_activated: "Not Activated",
  not_invited: "Not Activated",
  [PORTAL_STATUS.INVITATION_SENT]: "Invitation Sent",
  [PORTAL_STATUS.ACTIVATED]: "Active",
  [PORTAL_STATUS.EXPIRED]: "Expired",
  [PORTAL_STATUS.REVOKED]: "Revoked",
});

/**
 * @param {PortalInviteRow | null | undefined} invite
 * @param {Date} [now]
 */
export function isPendingPortalInvite(invite, now = new Date()) {
  if (!invite) return false;
  if (invite.revoked_at) return false;
  const status = String(invite.status || "").trim().toLowerCase();
  if (status && status !== "pending") return false;
  if (invite.expires_at) {
    const expires = new Date(invite.expires_at).getTime();
    if (Number.isFinite(expires) && expires <= now.getTime()) return false;
  }
  return true;
}

/**
 * Pending-status invite whose expires_at is in the past (not revoked).
 * @param {PortalInviteRow | null | undefined} invite
 * @param {Date} [now]
 */
export function isExpiredPortalInvite(invite, now = new Date()) {
  if (!invite) return false;
  if (invite.revoked_at) return false;
  const status = String(invite.status || "").trim().toLowerCase();
  if (status && status !== "pending") return false;
  if (!invite.expires_at) return false;
  const expires = new Date(invite.expires_at).getTime();
  return Number.isFinite(expires) && expires <= now.getTime();
}

/**
 * @param {PortalMembershipFields} membership
 * @param {PortalInviteRow | null | undefined} [invite]
 */
export function derivePortalStatus(membership = {}, invite = null) {
  if (membership?.portal_revoked_at) return PORTAL_STATUS.REVOKED;
  if (membership?.user_id) return PORTAL_STATUS.ACTIVATED;
  if (isPendingPortalInvite(invite)) return PORTAL_STATUS.INVITATION_SENT;
  if (isExpiredPortalInvite(invite)) return PORTAL_STATUS.EXPIRED;
  return PORTAL_STATUS.NOT_ACTIVATED;
}

/**
 * @param {string | null | undefined} status
 */
export function portalStatusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  return PORTAL_STATUS_LABELS[key] || "Unknown";
}

/**
 * Admin Overview action label for Employee Portal row.
 * @param {string | null | undefined} status
 */
export function portalAccessActionLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === PORTAL_STATUS.ACTIVATED) return "Copy Portal Link";
  if (key === PORTAL_STATUS.INVITATION_SENT) return "Copy Activation Link";
  if (key === PORTAL_STATUS.EXPIRED) return "Send New Activation Link";
  if (key === PORTAL_STATUS.REVOKED) return "Send Employee Portal Invite";
  return "Send Employee Portal Invite";
}

/**
 * Public flags safe for API responses (never include PIN hash or invite token).
 * @param {{
 *   portal_status?: string,
 *   pos_access?: boolean,
 *   pos_pin_set?: boolean,
 *   pos_pin_locked?: boolean,
 * }} [opts]
 */
export function publicPortalAccessView(opts = {}) {
  return {
    portal_status: opts.portal_status || PORTAL_STATUS.NOT_ACTIVATED,
    portal_status_label: portalStatusLabel(opts.portal_status),
    pos_access: Boolean(opts.pos_access),
    pos_pin_set: Boolean(opts.pos_pin_set),
    pos_pin_locked: Boolean(opts.pos_pin_locked),
  };
}
