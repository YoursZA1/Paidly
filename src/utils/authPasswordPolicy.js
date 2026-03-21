/** Minimum length aligned with OWASP guidance (prefer passphrases; avoid storing or logging passwords). */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * @param {string} password
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePasswordForSignup(password) {
  const pw = typeof password === "string" ? password : "";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true };
}
