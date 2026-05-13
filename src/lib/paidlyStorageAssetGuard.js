/**
 * Paidly logo / public storage URL guard — sync validation, short-lived failure cache, optional HEAD checks.
 *
 * DB hygiene (deleted objects still referenced in `profiles.logo_url` / `owner_logo_url`):
 * clear stale paths via Settings save, migrations, or Supabase SQL; this module only avoids repeat
 * client fetches and marks failures for the current session (+ TTL window).
 */

const FAILED_URL_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, number>} normalized URL → expiresAt (epoch ms) */
const failedUrlExpiry = new Map();

function pruneFailedUrlCache() {
  const now = Date.now();
  for (const [k, exp] of failedUrlExpiry) {
    if (exp <= now) failedUrlExpiry.delete(k);
  }
}

export function normalizeAssetUrlKey(url) {
  return String(url || "")
    .trim()
    .split("?")[0]
    .split("#")[0];
}

/**
 * Remember a public URL that failed to load (404/400 or image onError) so we skip rendering it again briefly.
 * @param {string} url
 */
export function markStorageAssetFailed(url) {
  const k = normalizeAssetUrlKey(url);
  if (!k) return;
  failedUrlExpiry.set(k, Date.now() + FAILED_URL_TTL_MS);
  pruneFailedUrlCache();
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isStorageAssetKnownFailed(url) {
  pruneFailedUrlCache();
  const k = normalizeAssetUrlKey(url);
  const exp = failedUrlExpiry.get(k);
  return typeof exp === "number" && exp > Date.now();
}

/**
 * Reject path traversal and obvious garbage before `getPublicUrl` / `<img>`.
 * Allows `userId/logo.png`, `logo-uuid.jpg`, encoded segments (`%20`), and legacy nested keys.
 * @param {string} cleaned — object key inside the bucket (not full URL)
 * @returns {boolean}
 */
export function isValidLogoStorageObjectKey(cleaned) {
  if (!cleaned) return false;
  const s = String(cleaned).trim();
  if (s.startsWith("blob:") || s.startsWith("data:")) return true;
  if (s.length > 768 || s.length < 1) return false;
  if (/\.\./.test(s)) return false;
  if (s.startsWith("/") || s.includes("//")) return false;
  if (/[\u0000-\u001F\u007F]/.test(s)) return false;
  return /^[a-zA-Z0-9._\-/%+]+$/.test(s);
}

/**
 * Optional HEAD probe for Supabase public object URLs. On CORS/network errors returns **true** (optimistic)
 * so the `<img>` can still try; only definite 400/404 marks missing.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} true if likely reachable or unknown
 */
export async function verifyPublicStorageUrlOnce(url, options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 4500;
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return true;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      credentials: "omit",
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 401) return false;
    if (res.status === 405 || res.status === 501) return true;
    return res.ok;
  } catch {
    return true;
  } finally {
    clearTimeout(tid);
  }
}

/** @internal Vitest — clears in-memory failure TTL map */
export function __clearStorageAssetFailuresForTests() {
  failedUrlExpiry.clear();
}
