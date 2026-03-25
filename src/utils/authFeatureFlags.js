/**
 * Google OAuth UI is opt-in until Supabase has the Google provider enabled.
 * Set VITE_GOOGLE_AUTH_ENABLED=1 (or true) in Vite env when ready.
 */
function isTruthyViteFlag(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export function isGoogleOAuthEnabled() {
  return isTruthyViteFlag(import.meta.env.VITE_GOOGLE_AUTH_ENABLED);
}
