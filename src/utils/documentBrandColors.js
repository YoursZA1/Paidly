/** Matches `index.css` --brand-primary / --brand-secondary (Paidly defaults). */
export const DEFAULT_DOCUMENT_BRAND_PRIMARY = "#f24e00";
export const DEFAULT_DOCUMENT_BRAND_SECONDARY = "#ff7c00";

const HEX6 = /^#([A-Fa-f0-9]{6})$/;

/**
 * @param {unknown} raw
 * @returns {string | null} Normalized #rrggbb or null
 */
export function parseDocumentBrandHex(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const withHash = s.startsWith("#") ? s : `#${s}`;
  return HEX6.test(withHash) ? withHash.toLowerCase() : null;
}

/**
 * @param {object} [user]
 * @returns {{ primary: string, secondary: string }}
 */
export function resolveDocumentBrandColors(user) {
  const primary = parseDocumentBrandHex(user?.document_brand_primary) ?? DEFAULT_DOCUMENT_BRAND_PRIMARY;
  const secondary = parseDocumentBrandHex(user?.document_brand_secondary) ?? DEFAULT_DOCUMENT_BRAND_SECONDARY;
  return { primary, secondary };
}

/**
 * Values to persist on invoice/quote rows for public client views (Supabase text columns, null = default in UI).
 * @param {object|null|undefined} user — profile / session user
 */
export function snapshotDocumentBrandForPersist(user) {
  return {
    document_brand_primary: parseDocumentBrandHex(user?.document_brand_primary),
    document_brand_secondary: parseDocumentBrandHex(user?.document_brand_secondary),
  };
}
