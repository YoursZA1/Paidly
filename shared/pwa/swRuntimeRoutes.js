// @ts-check

/**
 * Workbox runtime routes for the application-shell service worker.
 * Cross-origin `/api/` URLs (Vercel toolbar avatars, extensions) must not match.
 */

/**
 * Workbox 7 `registerRoute` match callbacks receive `{ url, request, event, sameOrigin }`.
 * generateSW serializes this function into `sw.js`; do not require `sameOrigin` —
 * older call sites and tests only pass `{ url, request }`.
 *
 * @returns {string}
 */
function getRuntimeOrigin() {
  try {
    const loc = globalThis.self?.location || globalThis.location;
    if (loc && typeof loc.origin === "string" && loc.origin) return loc.origin;
  } catch {
    // Non-browser unit tests have no Location.
  }
  return "";
}

/**
 * @param {{ url?: URL, request?: Request, sameOrigin?: boolean } | null | undefined} ctx
 * @param {URL} url
 */
function isSameOriginApiHost(ctx, url) {
  if (ctx?.sameOrigin === true) return true;
  if (ctx?.sameOrigin === false) return false;
  const runtimeOrigin = getRuntimeOrigin();
  if (runtimeOrigin) return url.origin === runtimeOrigin;
  return false;
}

/**
 * @param {{ url?: URL, request?: Request, sameOrigin?: boolean } | null | undefined} ctx
 */
export function isPaidlyApiRequest(ctx) {
  const url = ctx?.url;
  if (!url || typeof url.pathname !== "string") return false;
  if (!url.pathname.startsWith("/api/")) return false;
  return isSameOriginApiHost(ctx, url);
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
