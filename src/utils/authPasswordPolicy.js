/** Minimum length aligned with server-side isStrongPassword() (12+ chars). */
export const MIN_PASSWORD_LENGTH = 12;

const UPPER = /[A-Z]/;
const LOWER = /[a-z]/;
const DIGIT = /[0-9]/;
const SYMBOL = /[^A-Za-z0-9]/;

/**
 * @param {string} password
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePasswordForSignup(password) {
  const pw = typeof password === "string" ? password : "";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (pw.length > 256) {
    return { ok: false, message: "Password must be 256 characters or fewer." };
  }
  if (!UPPER.test(pw)) {
    return { ok: false, message: "Password must include at least one uppercase letter." };
  }
  if (!LOWER.test(pw)) {
    return { ok: false, message: "Password must include at least one lowercase letter." };
  }
  if (!DIGIT.test(pw)) {
    return { ok: false, message: "Password must include at least one number." };
  }
  if (!SYMBOL.test(pw)) {
    return { ok: false, message: "Password must include at least one symbol." };
  }
  return { ok: true };
}
