/**
 * Persist resolved logo public URLs (path → url + timestamp) to cut repeat Supabase URL work and
 * stabilize `<img src>` across navigations. Not for secrets — public object URLs only.
 */
import { normalizeAssetUrlKey } from "@/lib/paidlyStorageAssetGuard";

const STORAGE_PREFIX = "paidly_logo_url_v1:";

/** Signed-style URLs refresh sooner; stable public URLs can live longer. */
function maxAgeForResolvedUrl(url) {
  if (/[?&]token=/i.test(String(url || ""))) return 45 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function storageKeyForSrc(src) {
  const k = normalizeAssetUrlKey(src);
  if (!k) return null;
  return `${STORAGE_PREFIX}${k.slice(0, 400)}`;
}

/**
 * @param {string} src — same input as {@link AssetService.getLogo}
 * @returns {{ url: string, savedAt: number } | null}
 */
export function readLogoUrlDiskCache(src) {
  if (typeof localStorage === "undefined" || !src) return null;
  const key = storageKeyForSrc(src);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const url = typeof parsed?.url === "string" ? parsed.url : "";
    const savedAt = Number(parsed?.savedAt);
    if (!url || !Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > maxAgeForResolvedUrl(url)) {
      localStorage.removeItem(key);
      return null;
    }
    return { url, savedAt };
  } catch {
    return null;
  }
}

/**
 * @param {string} src
 * @param {string} resolvedPublicUrl
 */
export function writeLogoUrlDiskCache(src, resolvedPublicUrl) {
  if (typeof localStorage === "undefined" || !src || !resolvedPublicUrl) return;
  const key = storageKeyForSrc(src);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ url: resolvedPublicUrl, savedAt: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export function clearLogoUrlDiskCacheForSrc(src) {
  if (typeof localStorage === "undefined" || !src) return;
  const key = storageKeyForSrc(src);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function __clearLogoUrlDiskCacheForTests() {
  if (typeof localStorage === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
