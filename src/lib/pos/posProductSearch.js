/**
 * Fast POS catalog lookup.
 * Barcode and SKU live on public.services and are compared as strings (never Number()).
 */

export function normalizePosQuery(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Trim, drop spaces, lowercase. Do not parse as a number — "0123" must not become "123". */
export function normalizePosCode(value) {
  return normalizePosQuery(value).replace(/\s+/g, "");
}

function skuKeys(product) {
  return [product?.sku, product?.product_code, product?.code];
}

function emptyIndex() {
  return { byBarcode: new Map(), bySku: new Map() };
}

/**
 * O(1) exact lookup. Barcode map is separate from SKU so barcode always wins.
 */
export function buildPosCodeIndex(products) {
  const index = emptyIndex();
  for (const product of Array.isArray(products) ? products : []) {
    const barcodeKey = normalizePosCode(product?.barcode);
    if (barcodeKey && !index.byBarcode.has(barcodeKey)) index.byBarcode.set(barcodeKey, product);
    for (const raw of skuKeys(product)) {
      const key = normalizePosCode(raw);
      if (key && !index.bySku.has(key)) index.bySku.set(key, product);
    }
  }
  return index;
}

export function lookupPosProductByBarcode(index, raw) {
  const key = normalizePosCode(raw);
  if (!key || !index) return null;
  if (index.byBarcode) return index.byBarcode.get(key) || null;
  return null;
}

export function lookupPosProductBySku(index, raw) {
  const key = normalizePosCode(raw);
  if (!key || !index) return null;
  if (index.bySku) return index.bySku.get(key) || null;
  if (typeof index.get === "function") return index.get(key) || null;
  return null;
}

/** Exact barcode first, then SKU / product code. */
export function lookupPosProductByCode(index, raw) {
  return lookupPosProductByBarcode(index, raw) || lookupPosProductBySku(index, raw);
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

function productCodeList(product) {
  return [product?.barcode, ...skuKeys(product)].map(normalizePosCode).filter(Boolean);
}

/**
 * Ranked filter for the till grid.
 * Exact barcode match returns that product only.
 */
export function filterPosProducts(products, { query = "", category = "all", codeIndex = null } = {}) {
  const list = Array.isArray(products) ? products : [];
  const scoped = list.filter((p) => inCategory(p, category));
  const q = normalizePosQuery(query);
  if (!q) return scoped;

  const codeQ = normalizePosCode(query);
  const barcodeHit = lookupPosProductByBarcode(codeIndex, query);
  if (barcodeHit && inCategory(barcodeHit, category)) return [barcodeHit];

  const skuHit = lookupPosProductBySku(codeIndex, query);
  if (skuHit && inCategory(skuHit, category) && isPosScanQuery(query)) return [skuHit];

  const ranked = [];
  const seen = new Set();

  const push = (product, rank) => {
    if (!product?.id || seen.has(product.id)) return;
    seen.add(product.id);
    ranked.push({ product, rank });
  };

  if (skuHit && inCategory(skuHit, category)) push(skuHit, 0);

  for (const product of scoped) {
    const codes = productCodeList(product);
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

/**
 * Compact scanner payloads: EAN/UPC digits, or Code 128 / SKU-like tokens that include a digit.
 * Name search like "pads" stays false.
 */
export function isPosScanQuery(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /\s/.test(raw)) return false;
  const code = normalizePosCode(raw);
  if (code.length < 4) return false;
  if (/^\d+$/.test(code)) return code.length >= 8;
  return /^[a-z0-9._-]+$/i.test(code) && /\d/.test(code) && code.length >= 6;
}
