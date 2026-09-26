// @ts-check
/**
 * One rule for "may this Supabase user use Paidly": an account with an email must have verified it.
 * Used by the API (server/src/supabaseAuth.js) and the app guard (RequireAuth) so both agree.
 * Accounts without an email (none today) are not email-gated.
 *
 * @param {{ email?: string | null, email_confirmed_at?: string | null } | null | undefined} user
 */
export function isEmailVerifiedUser(user) {
  if (!user) return false;
  if (!String(user.email || "").trim()) return true;
  return Boolean(user.email_confirmed_at);
}

export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";
