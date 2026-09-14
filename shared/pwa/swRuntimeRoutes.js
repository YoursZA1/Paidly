// @ts-check

/**
 * Workbox runtime routes for the application-shell service worker.
 * Cross-origin `/api/` URLs (Vercel toolbar avatars, extensions) must not match.
 */

/**
 * @param {{ url?: URL, sameOrigin?: boolean } | null | undefined} ctx
 */
export function isPaidlyApiRequest(ctx) {
  const url = ctx?.url;
  if (!url || typeof url.pathname !== "string") return false;
  if (ctx.sameOrigin !== true) return false;
  return url.pathname.startsWith("/api/");
}

/**
 * @param {{ url?: URL } | null | undefined} ctx
 */
export function isSupabaseRequest(ctx) {
  const url = ctx?.url;
  if (!url || typeof url.hostname !== "string") return false;
  return url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.com");
}

/**
 * @param {{ url?: URL } | null | undefined} ctx
 */
export function isSentryRequest(ctx) {
  const url = ctx?.url;
  if (!url || typeof url.hostname !== "string") return false;
  return url.hostname === "sentry.io" || url.hostname.endsWith(".sentry.io");
}
