/**
 * Persist the active document brand (public.companies.id) per organization.
 * This is a UI default for new documents — it never rewrites existing rows.
 */

export const ORG_DEFAULT_BRAND_VALUE = "__org_default__";

const storageKey = (orgId) => `paidly.activeDocumentBrand.${orgId}`;

/** @param {unknown} raw @returns {string | null} */
export function normalizeBrandId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === ORG_DEFAULT_BRAND_VALUE) return null;
  return s;
}

/**
 * @param {string} orgId
 * @returns {string | null}
 */
export function readActiveBrandId(orgId) {
  if (!orgId || typeof localStorage === "undefined") return null;
  try {
    return normalizeBrandId(localStorage.getItem(storageKey(orgId)));
  } catch {
    return null;
  }
}

/**
 * @param {string} orgId
 * @param {string | null} brandId
 */
export function writeActiveBrandId(orgId, brandId) {
  if (!orgId || typeof localStorage === "undefined") return;
  try {
    const id = normalizeBrandId(brandId);
    if (!id) localStorage.removeItem(storageKey(orgId));
    else localStorage.setItem(storageKey(orgId), id);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Drop a stored id that is no longer in the org's brand list.
 * @param {string | null} storedId
 * @param {Array<{ id?: string }>} brands
 */
export function reconcileStoredBrandId(storedId, brands) {
  const id = normalizeBrandId(storedId);
  if (!id) return null;
  const list = Array.isArray(brands) ? brands : [];
  return list.some((row) => row?.id === id) ? id : null;
}
