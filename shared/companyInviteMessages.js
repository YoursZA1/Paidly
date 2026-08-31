/** Public copy for invitation validate/accept errors. Never include the raw token. */

export const INVITE_ACCEPT_ERRORS = Object.freeze({
  email_mismatch: "This invitation was issued to a different email address.",
  expired: "This invitation has expired. Ask your administrator to send a new invite.",
  revoked: "This invitation has been revoked.",
  not_pending: "This invitation is no longer active.",
  already_accepted: "Invitation has already been accepted.",
  not_found: "This invitation is invalid or has already been used.",
  not_authenticated: "Sign in with the invited email to accept this invitation.",
  missing_token: "This invitation link is incomplete.",
  already_member: "You already belong to this business.",
});

/**
 * @param {string | null | undefined} code
 * @param {string | null | undefined} [status]
 */
export function invitePublicErrorMessage(code, status) {
  const reason = String(code || "").trim().toLowerCase();
  const st = String(status || "").trim().toLowerCase();
  if (reason === "email_mismatch") return INVITE_ACCEPT_ERRORS.email_mismatch;
  if (reason === "revoked" || st === "revoked") return INVITE_ACCEPT_ERRORS.revoked;
  if (reason === "expired" || st === "expired") return INVITE_ACCEPT_ERRORS.expired;
  if (reason === "already_accepted" || st === "accepted" || (reason === "not_pending" && st === "accepted")) {
    return INVITE_ACCEPT_ERRORS.already_accepted;
  }
  if (reason === "not_pending") return INVITE_ACCEPT_ERRORS.not_pending;
  if (reason === "not_found") return INVITE_ACCEPT_ERRORS.not_found;
  if (reason === "not_authenticated") return INVITE_ACCEPT_ERRORS.not_authenticated;
  if (reason === "missing_token") return INVITE_ACCEPT_ERRORS.missing_token;
  if (reason === "already_member") return INVITE_ACCEPT_ERRORS.already_member;
  return INVITE_ACCEPT_ERRORS.not_found;
}
