// @ts-check

/**
 * Workbox runtime routes for the application-shell service worker.
 * Cross-origin `/api/` URLs (Vercel toolbar avatars, extensions) must not match.
 *
 * generateSW serializes `urlPattern` with Function.prototype.toString().
 * Matchers used from vite.config must be self-contained — do not call helpers.
 */

/**
 * Workbox 7 `registerRoute` match callbacks receive `{ url, request, event, sameOrigin }`.
 * Older call sites and tests only pass `{ url, request }`.
 *
 * @param {{ url?: URL, request?: Request, sameOrigin?: boolean } | null | undefined} ctx
 */
export function isPaidlyApiRequest(ctx) {
  const url = ctx?.url;
  if (!url || typeof url.pathname !== "string") return false;
  if (!url.pathname.startsWith("/api/")) return false;
  if (ctx?.sameOrigin === true) return true;
  if (ctx?.sameOrigin === false) return false;
  let runtimeOrigin = "";
  try {
    const loc = globalThis.self?.location || globalThis.location;
    if (loc && typeof loc.origin === "string" && loc.origin) runtimeOrigin = loc.origin;
  } catch {
    // Non-browser unit tests have no Location.
  }
  if (runtimeOrigin) return url.origin === runtimeOrigin;
  return false;
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
