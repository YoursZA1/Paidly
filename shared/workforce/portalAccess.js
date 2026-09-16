// @ts-check

/**
 * Employee portal access status derived from memberships + company_invites.
 * Canonical identity remains memberships.id — no second portal account table.
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
  NOT_INVITED: "not_invited",
  INVITATION_SENT: "invitation_sent",
  ACTIVATED: "activated",
  REVOKED: "revoked",
});

export const PORTAL_STATUS_LABELS = Object.freeze({
  [PORTAL_STATUS.NOT_INVITED]: "Not invited",
  [PORTAL_STATUS.INVITATION_SENT]: "Invitation sent",
  [PORTAL_STATUS.ACTIVATED]: "Active",
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
 * @param {PortalMembershipFields} membership
 * @param {PortalInviteRow | null | undefined} [pendingInvite]
 */
export function derivePortalStatus(membership = {}, pendingInvite = null) {
  if (membership?.portal_revoked_at) return PORTAL_STATUS.REVOKED;
  if (membership?.user_id) return PORTAL_STATUS.ACTIVATED;
  if (isPendingPortalInvite(pendingInvite)) return PORTAL_STATUS.INVITATION_SENT;
  return PORTAL_STATUS.NOT_INVITED;
}

/**
 * @param {string | null | undefined} status
 */
export function portalStatusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  return PORTAL_STATUS_LABELS[key] || "Unknown";
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
    portal_status: opts.portal_status || PORTAL_STATUS.NOT_INVITED,
    portal_status_label: portalStatusLabel(opts.portal_status),
    pos_access: Boolean(opts.pos_access),
    pos_pin_set: Boolean(opts.pos_pin_set),
    pos_pin_locked: Boolean(opts.pos_pin_locked),
  };
}
