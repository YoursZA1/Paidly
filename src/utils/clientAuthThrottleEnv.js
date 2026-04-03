/**
 * When true, Paidly skips sessionStorage-based signup / login throttles (defense in depth).
 * Supabase Auth rate limits still apply — adjust those on a dedicated dev project:
 * Dashboard → Authentication → Rate limits (see https://supabase.com/docs/guides/auth/rate-limits ).
 *
 * - `import.meta.env.DEV`: relaxed while running `vite` (local dev).
 * - `VITE_RELAX_CLIENT_AUTH_THROTTLE=true`: optional override (e.g. preview builds against a dev backend).
 */
export function isClientAuthThrottleRelaxed() {
  try {
    if (import.meta.env?.DEV) return true;
    const v = String(import.meta.env?.VITE_RELAX_CLIENT_AUTH_THROTTLE || "")
      .trim()
      .toLowerCase();
    return v === "true" || v === "1";
  } catch {
    return false;
  }
}
