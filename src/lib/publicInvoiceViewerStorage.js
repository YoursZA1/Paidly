/**
 * One localStorage map of share-token → server-issued viewer JWT (HMAC).
 * Uses localStorage (not sessionStorage) so PDF opens in a new tab can read the same token.
 */
const KEY = "paidly_pub_inv_viewers_v1";

/** Remove legacy per-invoice sessionStorage keys from older builds. */
export function clearLegacyInvoiceVerificationSessionKeys() {
  try {
    if (typeof sessionStorage === "undefined") return;
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && /^invoice_[^_]+_verified_email$/i.test(k)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function readMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function getPublicInvoiceViewerToken(shareToken) {
  if (!shareToken) return null;
  const t = String(shareToken).trim();
  const map = readMap();
  const v = map[t];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function setPublicInvoiceViewerToken(shareToken, viewerToken) {
  if (!shareToken || !viewerToken) return;
  const map = readMap();
  map[String(shareToken).trim()] = String(viewerToken).trim();
  writeMap(map);
}

export function clearPublicInvoiceViewerToken(shareToken) {
  if (!shareToken) return;
  const map = readMap();
  delete map[String(shareToken).trim()];
  writeMap(map);
}
