/**
 * Namespaced localStorage for admin/support sync caches.
 * Reads migrate from legacy `breakapi_*` keys once; writes use `paidly_adm:*` and drop legacy.
 */

const PAIDLY_PREFIX = "paidly_adm:";

function paidlyKey(legacyKey) {
  return `${PAIDLY_PREFIX}${legacyKey}`;
}

export function adminCacheGet(legacyKey) {
  if (typeof localStorage === "undefined") return null;
  try {
    const pk = paidlyKey(legacyKey);
    let raw = localStorage.getItem(pk);
    if (raw !== null) return raw;
    raw = localStorage.getItem(legacyKey);
    if (raw !== null) {
      localStorage.setItem(pk, raw);
      localStorage.removeItem(legacyKey);
    }
    return raw;
  } catch {
    return null;
  }
}

export function adminCacheSet(legacyKey, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(paidlyKey(legacyKey), value);
    if (localStorage.getItem(legacyKey) !== null) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

export function adminCacheRemove(legacyKey) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(paidlyKey(legacyKey));
    localStorage.removeItem(legacyKey);
  } catch {
    /* ignore */
  }
}
