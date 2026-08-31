/**
 * Popular products on this till — derived from today's completed sales, not a second catalog.
 */

export function popularProductIdsFromSales(sales, { limit = 16 } = {}) {
  const counts = new Map();
  for (const sale of Array.isArray(sales) ? sales : []) {
    if (String(sale?.sale_kind || "sale") === "return") continue;
    const items = Array.isArray(sale?.items) ? sale.items : [];
    for (const line of items) {
      const id = line?.product_id;
      if (!id) continue;
      const qty = Number(line.quantity);
      counts.set(id, (counts.get(id) || 0) + (Number.isFinite(qty) && qty > 0 ? qty : 0));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * @param {object[]} products
 * @param {string} category  all | popular | a services.category name
 * @param {string[]} popularIds
 */
export function scopePosCatalog(products, category, popularIds) {
  const list = Array.isArray(products) ? products : [];
  if (category === "popular") {
    const order = new Map((Array.isArray(popularIds) ? popularIds : []).map((id, i) => [id, i]));
    return list
      .filter((p) => order.has(p.id))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }
  return list;
}
