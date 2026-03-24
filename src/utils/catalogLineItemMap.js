/** Valid item_type values for mapCatalogToLineItem / Supabase services catalog */

export const CATALOG_ITEM_TYPES = new Set(["service", "product", "labor", "material", "expense"]);

/**
 * Normalize a row from `services` so mapCatalogToLineItem validation passes
 * (legacy rows may omit item_type or use alternate rate field names).
 */
export function normalizeCatalogItemForMap(raw) {
  if (!raw?.id || !raw?.name) return null;
  const rateRaw =
    raw.default_rate ?? raw.rate ?? raw.price ?? raw.unit_price ?? raw.default_price ?? 0;
  const rate = Number(rateRaw);
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  const itemType =
    raw.item_type && CATALOG_ITEM_TYPES.has(String(raw.item_type).toLowerCase())
      ? String(raw.item_type).toLowerCase()
      : "service";
  return {
    ...raw,
    item_type: itemType,
    default_rate: safeRate,
  };
}

export function getCatalogItemRate(item) {
  if (!item) return 0;
  return (
    Number(
      item.default_rate ?? item.rate ?? item.price ?? item.unit_price ?? item.default_price ?? 0
    ) || 0
  );
}
