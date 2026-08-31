/**
 * Fast POS catalog lookup.
 * Product code in Paidly is services.sku (labeled "SKU / Product Code" in catalog forms).
 */

export function normalizePosQuery(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePosCode(value) {
  return normalizePosQuery(value).replace(/\s+/g, "");
}

function codeKeys(product) {
  return [
    product?.barcode,
    product?.sku,
    product?.product_code,
    product?.code,
  ];
}

/**
 * O(1) exact lookup by barcode, SKU, or product code.
 * First product wins if two rows share a code (catalog uniqueness is an inventory concern).
 */
export function buildPosCodeIndex(products) {
  const byCode = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const raw of codeKeys(product)) {
      const key = normalizePosCode(raw);
      if (key && !byCode.has(key)) byCode.set(key, product);
    }
  }
  return byCode;
}

export function lookupPosProductByCode(index, raw) {
  const key = normalizePosCode(raw);
  if (!key || !index) return null;
  return index.get(key) || null;
}

function inCategory(product, category) {
  if (!category || category === "all") return true;
  return String(product?.category || "").trim() === category;
}

/**
 * Distinct catalog categories from services.category — same field Inventory uses.
 * Do not introduce a categories table.
 */
export function listPosCatalogCategories(products) {
  const counts = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const name = String(product?.category || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function nameHaystack(product) {
  return String(product?.name || "").toLowerCase();
}

/**
 * Ranked filter for the till grid.
 * Exact codes first, then code prefixes, then name prefix / contains.
 * Category is a chip filter, not a text field.
 */
export function filterPosProducts(products, { query = "", category = "all", codeIndex = null } = {}) {
  const list = Array.isArray(products) ? products : [];
  const scoped = list.filter((p) => inCategory(p, category));
  const q = normalizePosQuery(query);
  if (!q) return scoped;

  const codeQ = normalizePosCode(query);
  const exact = codeIndex ? lookupPosProductByCode(codeIndex, query) : null;
  const exactInScope = exact && inCategory(exact, category) ? exact : null;

  const ranked = [];
  const seen = new Set();

  const push = (product, rank) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    ranked.push({ product, rank });
  };

  if (exactInScope) push(exactInScope, 0);

  for (const product of scoped) {
    const codes = codeKeys(product).map(normalizePosCode).filter(Boolean);
    if (codes.some((c) => c === codeQ)) {
      push(product, 0);
      continue;
    }
    if (codeQ && codes.some((c) => c.startsWith(codeQ))) {
      push(product, 1);
      continue;
    }
    const name = nameHaystack(product);
    if (name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q))) {
      push(product, 2);
      continue;
    }
    if (name.includes(q)) {
      push(product, 3);
    }
  }

  ranked.sort((a, b) => a.rank - b.rank || nameHaystack(a.product).localeCompare(nameHaystack(b.product)));
  return ranked.map((row) => row.product);
}

/** Digit barcodes (EAN/UPC) — used to add-or-reject on Enter without grabbing a name match. */
export function isPosScanQuery(value) {
  const code = normalizePosCode(value);
  if (code.length < 8) return false;
  if (/\s/.test(String(value || "").trim())) return false;
  return /^\d+$/.test(code);
}
