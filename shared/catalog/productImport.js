/**
 * Product import — the pure half shared by the browser (mapping, review) and the server (re-validation
 * before any write). No I/O, no dependencies.
 *
 *   document table  →  suggestColumnMapping()  →  buildImportRows()  →  validateImportRow()
 *                                                                     →  markInFileDuplicates()
 *                                                                     →  classifyDuplicate() (vs the company's catalogue)
 *
 * Paidly products are rows of public.services with item_type = 'product'. VAT is stored as
 * services.tax_category (standard / reduced / zero / exempt), not as a rate. Stock is
 * services.stock_quantity and only ever changes through the inventory ledger (adjust_inventory_stock).
 */

export const IMPORT_ITEM_TYPES = Object.freeze(["product", "service"]);

/** Paidly fields a document column can map to, in review-table order. */
export const PRODUCT_IMPORT_FIELDS = Object.freeze([
  { key: "name", label: "Product Name", required: true },
  { key: "sku", label: "SKU" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "cost_price", label: "Cost Price" },
  { key: "price", label: "Selling Price" },
  { key: "vat", label: "VAT" },
  { key: "stock", label: "Stock Quantity" },
  { key: "barcode", label: "Barcode" },
  { key: "unit", label: "Unit" },
]);

export const IMPORT_FIELD_KEYS = Object.freeze(PRODUCT_IMPORT_FIELDS.map((f) => f.key));
export const IGNORE_COLUMN = "__ignore__";

/** Fields that mean nothing for a service (no stock, no barcode). */
export const PRODUCT_ONLY_FIELDS = Object.freeze(["stock", "barcode", "cost_price"]);

export const IMPORT_LIMITS = Object.freeze({
  maxRows: 5000,
  maxFileBytes: 10 * 1024 * 1024,
  /** Rows per commit request (serverless-safe). */
  commitBatchSize: 100,
  /** Keys per duplicate-check request. */
  checkBatchSize: 1000,
  name: 200,
  description: 2000,
  sku: 64,
  barcode: 64,
  category: 100,
  brand: 100,
  unit: 30,
  maxMoney: 999_999_999.99,
  maxStock: 99_999_999,
});

export const DEFAULT_STANDARD_VAT_RATE = 15;

/** Template columns (Excel + CSV) — same labels the mapper recognises exactly. */
export const PRODUCT_TEMPLATE_HEADERS = Object.freeze(PRODUCT_IMPORT_FIELDS.map((f) => f.label));
export const PRODUCT_TEMPLATE_EXAMPLE_ROWS = Object.freeze([
  ["Coca Cola 330ml", "COKE330", "Coca-Cola Original can, 330ml", "Beverages", "Coca-Cola", "8.50", "12.00", "15%", "50", "5449000000996", "unit"],
  ["Coffee Beans 1kg", "COF001", "Medium roast whole beans", "Coffee", "Paidly Roasters", "120.00", "185.00", "15%", "20", "", "bag"],
]);

// ── Header recognition ────────────────────────────────────────────────────────────────────────

/** Deterministic synonyms per field (normalised: lowercase words). */
const FIELD_SYNONYMS = Object.freeze({
  name: ["product name", "name", "product", "item", "item name", "product title", "title", "stock item", "article", "article name", "product item"],
  sku: ["sku", "product code", "item code", "code", "stock code", "sku code", "article number", "art no", "part number", "part no", "item no", "item number", "product no", "product number", "plu", "ref", "reference", "model", "model number", "catalogue number", "cat no"],
  description: ["description", "product description", "item description", "details", "long description", "desc", "notes"],
  category: ["category", "type", "group", "product group", "product type", "department", "dept", "class", "family", "section", "product category", "sub category", "subcategory"],
  brand: ["brand", "manufacturer", "make", "brand name"],
  cost_price: ["cost price", "cost", "buying price", "purchase price", "unit cost", "cost excl", "cost excl vat", "landed cost", "buy price", "cost per unit", "wholesale price", "wholesale"],
  price: ["selling price", "price", "retail price", "retail", "unit price", "sale price", "sell price", "rrp", "price excl", "price excl vat", "selling price excl vat", "price incl", "price incl vat", "rate", "amount", "list price"],
  vat: ["vat", "tax", "tax rate", "vat rate", "vat percent", "vat percentage", "tax percent", "vat code", "tax code", "gst"],
  stock: ["stock quantity", "stock", "quantity", "qty", "on hand", "qty on hand", "stock on hand", "soh", "inventory", "qty available", "available", "in stock", "stock level", "balance", "units in stock", "opening stock", "count"],
  barcode: ["barcode", "bar code", "ean", "ean13", "ean 13", "upc", "gtin", "isbn", "barcode number"],
  unit: ["unit", "uom", "unit of measure", "units of measure", "measure", "pack unit", "sell unit", "unit type"],
});

/** Synonyms that are weak on their own (ambiguous) — never "high" confidence. */
const WEAK_SYNONYMS = new Set(["type", "code", "ref", "reference", "model", "amount", "rate", "available", "balance", "count", "measure", "title", "notes", "class", "section", "family", "make", "wholesale", "group", "article"]);

/** A header containing one of these words is never this field (e.g. "Price incl VAT" is not the VAT rate). */
const FIELD_EXCLUSIONS = Object.freeze({
  vat: /\b(price|cost|amount|total|value|incl|excl|number|no)\b/,
  unit: /\b(price|cost|qty|quantity|stock)\b/,
  stock: /\b(price|cost|value|amount)\b/,
  name: /\b(code|number|no|id|price|cost|brand|category|group)\b/,
  category: /\b(code|price|cost)\b/,
  cost_price: /\b(selling|retail|sale|sell)\b/,
});

/** @param {unknown} value */
export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/%/g, " percent ")
    .replace(/[#№]/g, " no ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(incl|inc|including)\b/g, "incl")
    .replace(/\b(excl|exc|ex|excluding)\b/g, "excl")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function containsPhrase(tokens, phraseTokens) {
  outer: for (let i = 0; i + phraseTokens.length <= tokens.length; i++) {
    for (let j = 0; j < phraseTokens.length; j++) {
      if (tokens[i + j] !== phraseTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * How strongly a header names a field: 1 exact synonym, ~0.85 contains a synonym phrase,
 * ~0.75 a near-spelling (typo), 0 no match. Weak synonyms are capped below "high".
 * @param {string} header
 * @param {string} field
 */
export function scoreHeaderForField(header, field) {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const tokens = h.split(" ");
  const exclusion = FIELD_EXCLUSIONS[field];
  const exact = (FIELD_SYNONYMS[field] || []).includes(h);
  if (exclusion && !exact && exclusion.test(h)) return 0;
  let best = 0;
  for (const syn of FIELD_SYNONYMS[field] || []) {
    const weak = WEAK_SYNONYMS.has(syn);
    let s = 0;
    if (h === syn) {
      s = weak ? 0.8 : 1;
    } else if (containsPhrase(tokens, syn.split(" "))) {
      // Longer synonym phrases inside the header are stronger evidence ("qty available" ⊃ "qty").
      s = Math.min(0.9, 0.7 + 0.05 * syn.split(" ").length) - (weak ? 0.1 : 0);
    } else if (h.length >= 4 && syn.length >= 4) {
      const dist = levenshtein(h, syn);
      const sim = 1 - dist / Math.max(h.length, syn.length);
      if (dist <= 2 && sim >= 0.8) s = weak ? 0.6 : 0.75;
    }
    if (s > best) best = s;
  }
  return best;
}

/**
 * Suggest a Paidly field for each document column. Each field is used at most once; ambiguous
 * columns (two columns fighting for one field, or a weak match) are left for the person to confirm.
 *
 * @param {string[]} headers
 * @param {{ itemType?: "product" | "service" }} [opts]
 * @returns {{ mapping: string[], confidence: Array<"high" | "medium" | "none">, notes: Array<string | null> }}
 */
export function suggestColumnMapping(headers, opts = {}) {
  const list = Array.isArray(headers) ? headers.map((h) => String(h ?? "")) : [];
  const fields = IMPORT_FIELD_KEYS.filter((f) => opts.itemType !== "service" || !PRODUCT_ONLY_FIELDS.includes(f));
  const candidates = [];
  list.forEach((header, col) => {
    for (const field of fields) {
      const score = scoreHeaderForField(header, field);
      if (score >= 0.6) candidates.push({ col, field, score });
    }
  });
  // Selling price: prefer VAT-exclusive columns (Paidly prices exclude VAT).
  for (const c of candidates) {
    const h = normalizeHeader(list[c.col]);
    if (c.field === "price" && /\bincl\b/.test(h)) c.score -= 0.05;
    if (c.field === "price" && /\bexcl\b/.test(h)) c.score += 0.02;
  }
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);

  const mapping = list.map(() => IGNORE_COLUMN);
  const confidence = list.map(() => "none");
  const notes = list.map(() => null);
  const usedFields = new Set();
  const usedCols = new Set();
  for (const c of candidates) {
    if (usedCols.has(c.col)) continue;
    if (usedFields.has(c.field)) {
      // A second column that also looks like this field — flag rather than guess.
      if (c.score >= 0.8 && !notes[c.col]) {
        const label = PRODUCT_IMPORT_FIELDS.find((f) => f.key === c.field)?.label || c.field;
        notes[c.col] = `Also looks like ${label}. Pick a field if you need this column.`;
      }
      continue;
    }
    mapping[c.col] = c.field;
    confidence[c.col] = c.score >= 0.95 ? "high" : "medium";
    usedFields.add(c.field);
    usedCols.add(c.col);
  }

  // "Description" as the only text column is the product name.
  if (!usedFields.has("name")) {
    const descCol = mapping.indexOf("description");
    if (descCol >= 0) {
      mapping[descCol] = "name";
      confidence[descCol] = "medium";
      notes[descCol] = "No product name column found — using this column as the name.";
    }
  }
  list.forEach((header, col) => {
    if (mapping[col] === "price" && /\bincl\b/.test(normalizeHeader(header))) {
      notes[col] = "This column looks VAT-inclusive. Paidly selling prices exclude VAT.";
      if (confidence[col] === "high") confidence[col] = "medium";
    }
  });
  return { mapping, confidence, notes };
}

/** A header line has ≥2 recognisable columns incl. an identity (name/sku/description) and a value column. */
export function looksLikeHeaderRow(cells) {
  const matched = new Set();
  for (const cell of cells || []) {
    for (const field of IMPORT_FIELD_KEYS) {
      if (scoreHeaderForField(cell, field) >= 0.8) matched.add(field);
    }
  }
  const identity = ["name", "sku", "description"].some((f) => matched.has(f));
  const value = ["price", "cost_price", "stock", "vat", "barcode", "category"].some((f) => matched.has(f));
  return matched.size >= 2 && identity && value;
}

/** Stable key for "same headers as before" (remembered mappings). */
export function headerSignature(headers) {
  return (headers || []).map(normalizeHeader).join("|");
}

// ── Normalisers ───────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g;
const HTML_TAG = /<\/?[a-zA-Z][^<>]*>/g;
const FORMULA_LIKE = /^[=+@]\s*[A-Za-z_]+\s*\(|^=/;

/**
 * Trim, drop control characters and HTML tags, collapse runs of spaces. Returns what changed so the
 * review screen can say so. Meaningful text is otherwise left exactly as written.
 * @param {unknown} value
 * @param {{ multiline?: boolean }} [opts]
 */
export function cleanImportText(value, opts = {}) {
  if (value == null) return { text: "", strippedHtml: false, formulaLike: false };
  let s = String(value).normalize("NFC").replace(CONTROL_CHARS, "");
  const withoutTags = s.replace(HTML_TAG, " ");
  const strippedHtml = withoutTags !== s;
  s = withoutTags;
  s = opts.multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  s = s.trim();
  return { text: s, strippedHtml, formulaLike: FORMULA_LIKE.test(s) };
}

// Only ever applied to a cell that should be an amount; anything left that isn't digits/separators fails.
const CURRENCY_TOKENS = /(zar|usd|eur|gbp|bwp|nad|szl|lsl|kes|ngn|incl\.?|excl\.?|vat|each|per\s*unit|ea\b)|[R$€£¥₦]|\/-/gi;

/**
 * "R1,250.00", "R 1 250,00", "1 250.00", "1250", 1250 → 1250. Returns null when not a number.
 * Decimal separator: the last of ',' / '.' when both appear; a lone ',' followed by exactly three
 * digits is a thousands separator, otherwise a decimal comma.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseImportMoney(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let s = String(value).normalize("NFKC").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(CURRENCY_TOKENS, "").replace(/[\s\u00A0\u202F']/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    const thousandsStyle = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3;
    normalized = thousandsStyle ? parts.join("") : parts.length === 2 ? `${parts[0]}.${parts[1]}` : null;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    normalized = parts.length === 2 ? s : parts.slice(1).every((p) => p.length === 3) ? parts.join("") : null;
  } else {
    normalized = s;
  }
  if (normalized == null || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

/**
 * VAT → { rate (percent) | null, category } where category is a services.tax_category value.
 * "15%", "15", "VAT 15%", "0.15" → 15 (standard). "0", "zero rated" → zero. "exempt" → exempt.
 * @param {unknown} value
 * @param {{ standardRate?: number }} [opts]
 * @returns {{ ok: true, empty?: boolean, rate: number | null, category: "standard" | "reduced" | "zero" | "exempt" | null, note?: string } | { ok: false }}
 */
export function parseImportVat(value, opts = {}) {
  const standard = Number(opts.standardRate) > 0 ? Number(opts.standardRate) : DEFAULT_STANDARD_VAT_RATE;
  if (value == null || (typeof value === "string" && !value.trim())) return { ok: true, empty: true, rate: null, category: null };
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (/^(standard|std|s)$/.test(lower)) return { ok: true, rate: standard, category: "standard" };
    if (/^(n\/?a|-|—)$/.test(lower)) return { ok: true, empty: true, rate: null, category: null };
    if (/exempt|^e$/.test(lower)) return { ok: true, rate: null, category: "exempt" };
    if (/zero|^z$|^no vat$|^none$/.test(lower)) return { ok: true, rate: 0, category: "zero" };
    if (/^(yes|y|true|vatable|taxable)$/.test(lower)) return { ok: true, rate: standard, category: "standard" };
    if (/^(no|n|false)$/.test(lower)) return { ok: true, rate: 0, category: "zero" };
  }
  let n;
  if (typeof value === "number") {
    n = value;
  } else {
    const m = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/g);
    if (!m || m.length !== 1) return { ok: false };
    n = Number(m[0]);
  }
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  // 0.15 → 15%. 1 is read as 1%.
  if (n > 0 && n < 1) n = n * 100;
  n = Math.round(n * 1000) / 1000;
  if (n > 100) return { ok: false };
  if (n === 0) return { ok: true, rate: 0, category: "zero" };
  if (Math.abs(n - standard) < 0.001) return { ok: true, rate: n, category: "standard" };
  if (n < standard) {
    return { ok: true, rate: n, category: "reduced", note: `Paidly stores VAT as a category — ${n}% will be saved as Reduced.` };
  }
  return { ok: true, rate: n, category: "standard", note: `${n}% isn't the standard rate (${standard}%) — it will be saved as Standard VAT.` };
}

/**
 * "10 units", "Qty: 10", "10", "1,000", 10 → 10. Null when not exactly one readable number.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseImportStock(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const s = String(value).normalize("NFKC").trim();
  if (!s) return null;
  const numbers = s.replace(/(\d)[\s\u00A0\u202F,](?=\d{3}\b)/g, "$1").match(/-?\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length !== 1) return null;
  const n = Number(numbers[0].replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Product count styles the Products page supports (services.default_unit values). */
const UNIT_ALIASES = Object.freeze({
  unit: ["unit", "units", "each", "ea", "pc", "pcs", "piece", "pieces", "item", "items", "single", "no", "nos", "u"],
  case: ["case", "cases", "cs", "carton", "cartons", "ctn", "ctns"],
  pack: ["pack", "packs", "pk", "pkt", "packet", "packets", "pkg"],
  box: ["box", "boxes", "bx"],
  pallet: ["pallet", "pallets", "plt"],
  bottle: ["bottle", "bottles", "btl"],
  bag: ["bag", "bags", "sack", "sacks"],
  roll: ["roll", "rolls"],
});

/**
 * Product: map to a supported count style, else "unit" with a note. Service: free text (hour, day…).
 * @param {unknown} value
 * @param {"product" | "service"} itemType
 */
export function normalizeImportUnit(value, itemType = "product") {
  const { text } = cleanImportText(value);
  if (!text) return { unit: null };
  const lower = text.toLowerCase();
  if (itemType === "service") return { unit: lower.slice(0, IMPORT_LIMITS.unit) };
  for (const [unit, aliases] of Object.entries(UNIT_ALIASES)) {
    if (aliases.includes(lower)) return { unit };
  }
  return { unit: "unit", note: `"${text.slice(0, 30)}" isn't a Paidly count style — it will be counted in units.` };
}

/** GTIN-8/12/13/14 check digit. */
export function isValidGtin(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * @param {unknown} value
 * @returns {{ barcode: string | null, error?: string, warning?: string }}
 */
export function normalizeImportBarcode(value) {
  if (value == null || value === "") return { barcode: null };
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return { barcode: null, error: "Barcode lost digits in Excel. Format the barcode column as Text and export again." };
    }
    value = String(value);
  }
  let s = String(value).normalize("NFKC").trim();
  if (!s) return { barcode: null };
  if (/^\d(\.\d+)?e\+\d+$/i.test(s)) {
    return { barcode: null, error: "Barcode lost digits in Excel. Format the barcode column as Text and export again." };
  }
  if (/^[\d\s-]+$/.test(s)) s = s.replace(/[\s-]/g, "");
  if (s.length > IMPORT_LIMITS.barcode || !/^[A-Za-z0-9._\-/]+$/.test(s)) {
    return { barcode: null, error: "Barcode can only contain letters, numbers, dashes and dots." };
  }
  if (/^\d+$/.test(s) && [8, 12, 13, 14].includes(s.length) && !isValidGtin(s)) {
    return { barcode: s, warning: "Barcode check digit doesn't match — double-check it." };
  }
  return { barcode: s };
}

/** Case-insensitive comparison key for SKUs / barcodes (stored as typed, matched without case). */
export function identifierKey(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

/** Name comparison key: case- and whitespace-insensitive. Matches the SQL lower(regexp_replace(btrim(name))) index. */
export function nameKey(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// ── Rows ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Apply a column mapping to a table. Skips blank rows and repeated header rows (PDF page breaks).
 * @param {{ headers: string[], rows: unknown[][], rowNumbers?: number[], rowMeta?: any[] }} table
 * @param {string[]} mapping field key (or IGNORE_COLUMN) per column
 * @returns {Array<{ rowNumber: number, raw: Record<string, unknown>, meta: any }>}
 */
export function buildImportRows(table, mapping) {
  const headers = table?.headers || [];
  const rows = table?.rows || [];
  const headerSig = headerSignature(headers);
  const out = [];
  rows.forEach((cells, i) => {
    const arr = Array.isArray(cells) ? cells : [];
    if (!arr.some((c) => c != null && String(c).trim() !== "")) return;
    if (headerSig && headerSignature(arr.slice(0, headers.length)) === headerSig) return;
    const raw = {};
    mapping.forEach((field, col) => {
      if (!field || field === IGNORE_COLUMN) return;
      const v = arr[col];
      if (v == null || (typeof v === "string" && v.trim() === "")) return;
      // Two columns mapped to one text field (e.g. description split over columns) are joined.
      raw[field] = raw[field] != null && typeof raw[field] === "string" ? `${raw[field]} ${v}` : v;
    });
    out.push({ rowNumber: table.rowNumbers?.[i] ?? i + 2, raw, meta: table.rowMeta?.[i] ?? null });
  });
  return out;
}

const TOTALS_LINE = /^(sub\s*-?\s*total|grand\s+total|totals?|balance\s+(due|b\/?f|c\/?f)|carried\s+forward|brought\s+forward)\b/i;

/**
 * Normalise + validate one row. The same function runs in the browser (review) and on the server
 * (before writing) — the server never trusts the browser's result.
 *
 * @param {Record<string, unknown>} raw field → cell value
 * @param {{ itemType?: "product" | "service", standardRate?: number }} [opts]
 * @returns {{
 *   value: { name: string, sku: string | null, description: string | null, category: string | null, brand: string | null,
 *            cost_price: number | null, price: number | null, vat_rate: number | null, tax_category: string | null,
 *            stock: number | null, barcode: string | null, unit: string | null },
 *   errors: Array<{ field: string, message: string, fix: string }>,
 *   warnings: Array<{ field: string, message: string, fix?: string }>,
 *   provided: string[],
 * }}
 */
export function validateImportRow(raw, opts = {}) {
  const itemType = opts.itemType === "service" ? "service" : "product";
  const r = raw && typeof raw === "object" ? raw : {};
  const errors = [];
  const warnings = [];
  const provided = IMPORT_FIELD_KEYS.filter((k) => r[k] != null && String(r[k]).trim() !== "");
  const err = (field, message, fix) => errors.push({ field, message, fix });
  const warn = (field, message, fix) => warnings.push({ field, message, ...(fix ? { fix } : {}) });

  const text = (field, limit, label, { multiline = false } = {}) => {
    const c = cleanImportText(r[field], { multiline });
    if (c.strippedHtml) warn(field, `HTML was removed from ${label.toLowerCase()}.`);
    if (c.formulaLike) warn(field, `${label} looks like a spreadsheet formula, not a value.`, "Replace it with the actual text.");
    if (c.text.length > limit) {
      err(field, `${label} is too long (max ${limit} characters).`, `Shorten it to ${limit} characters.`);
      return c.text.slice(0, limit);
    }
    return c.text || null;
  };

  const name = text("name", IMPORT_LIMITS.name, "Product name") || "";
  if (!name) err("name", "Product name is missing.", "Enter a product name.");
  else if (TOTALS_LINE.test(name) && !r.sku && !r.barcode) {
    err("name", "This looks like a totals line, not a product.", "Leave this row unticked.");
  }

  const sku = text("sku", IMPORT_LIMITS.sku, "SKU");
  const description = text("description", IMPORT_LIMITS.description, "Description", { multiline: true });
  const category = text("category", IMPORT_LIMITS.category, "Category");
  const brand = text("brand", IMPORT_LIMITS.brand, "Brand");

  const money = (field, label) => {
    if (!provided.includes(field)) return null;
    const n = parseImportMoney(r[field]);
    if (n == null) {
      err(field, `${label} must be a number.`, `Enter ${label.toLowerCase()} like 12.00.`);
      return null;
    }
    if (n < 0) {
      err(field, `${label} can't be negative.`, `Enter a positive ${label.toLowerCase()}.`);
      return null;
    }
    if (n > IMPORT_LIMITS.maxMoney) {
      err(field, `${label} is too large.`, "Check the amount.");
      return null;
    }
    return n;
  };
  const price = money("price", "Selling price");
  const costPrice = itemType === "product" ? money("cost_price", "Cost price") : null;
  if (!provided.includes("price") && name) warn("price", "No selling price — it will be saved as R0.00.", "Add a selling price.");
  if (price != null && costPrice != null && costPrice > price && price > 0) {
    warn("cost_price", "Cost price is higher than the selling price.");
  }

  let vatRate = null;
  let taxCategory = null;
  if (provided.includes("vat")) {
    const vat = parseImportVat(r.vat, { standardRate: opts.standardRate });
    if (!vat.ok) err("vat", "VAT must be a percentage like 15%, 0 or exempt.", "Enter 15%, 0% or exempt.");
    else {
      vatRate = vat.rate;
      taxCategory = vat.category;
      if (vat.note) warn("vat", vat.note);
    }
  }

  let stock = null;
  if (itemType === "product" && provided.includes("stock")) {
    stock = parseImportStock(r.stock);
    if (stock == null) err("stock", "Stock must be a number.", "Enter a stock quantity like 10.");
    else if (stock < 0) {
      err("stock", "Stock can't be negative.", "Enter 0 or more.");
      stock = null;
    } else if (stock > IMPORT_LIMITS.maxStock) {
      err("stock", "Stock quantity is too large.", "Check the quantity.");
      stock = null;
    }
  }

  let barcode = null;
  if (itemType === "product" && provided.includes("barcode")) {
    const b = normalizeImportBarcode(r.barcode);
    if (b.error) err("barcode", b.error, "Correct the barcode or clear it.");
    if (b.warning) warn("barcode", b.warning);
    barcode = b.barcode;
  }

  const unitResult = normalizeImportUnit(r.unit, itemType);
  if (unitResult.note) warn("unit", unitResult.note);

  return {
    value: {
      name,
      sku,
      description,
      category,
      brand,
      cost_price: costPrice,
      price,
      vat_rate: vatRate,
      tax_category: taxCategory,
      stock,
      barcode,
      unit: unitResult.unit,
    },
    errors,
    warnings,
    provided,
  };
}

/**
 * Within one file: the second SKU / barcode is a duplicate of the first (barcode duplicates can't
 * both be saved — active products need unique barcodes). Same name → warning only.
 * @param {Array<{ rowNumber: number, value: { name: string, sku: string | null, barcode: string | null } }>} rows
 * @returns {Map<number, { kind: "sku" | "barcode" | "name", firstRow: number }>} keyed by index in `rows`
 */
export function markInFileDuplicates(rows) {
  const seen = { sku: new Map(), barcode: new Map(), name: new Map() };
  const result = new Map();
  rows.forEach((row, i) => {
    const keys = {
      sku: row.value?.sku ? identifierKey(row.value.sku) : "",
      barcode: row.value?.barcode ? identifierKey(row.value.barcode) : "",
      name: row.value?.name ? nameKey(row.value.name) : "",
    };
    for (const kind of ["sku", "barcode", "name"]) {
      const key = keys[kind];
      if (!key) continue;
      if (seen[kind].has(key)) {
        if (!result.has(i)) result.set(i, { kind, firstRow: seen[kind].get(key) });
      } else {
        seen[kind].set(key, row.rowNumber);
      }
    }
  });
  return result;
}

/**
 * Find the company's existing catalogue item a row duplicates, strongest identifier first:
 * SKU → barcode → name. `existing` must already be scoped to the caller's company.
 * @param {{ sku?: string | null, barcode?: string | null, name?: string | null }} value
 * @param {Array<{ id: string, sku?: string | null, barcode?: string | null, name?: string | null, is_active?: boolean | null }>} existing
 * @returns {{ match: any, matchedBy: "sku" | "barcode" | "name" } | null}
 */
export function classifyDuplicate(value, existing) {
  const list = Array.isArray(existing) ? existing : [];
  const sku = value?.sku ? identifierKey(value.sku) : "";
  const barcode = value?.barcode ? identifierKey(value.barcode) : "";
  const name = value?.name ? nameKey(value.name) : "";
  if (sku) {
    const m = list.find((e) => e.sku && identifierKey(e.sku) === sku);
    if (m) return { match: m, matchedBy: "sku" };
  }
  if (barcode) {
    const m = list.find((e) => e.barcode && identifierKey(e.barcode) === barcode);
    if (m) return { match: m, matchedBy: "barcode" };
  }
  if (name) {
    const m = list.find((e) => e.name && nameKey(e.name) === name);
    if (m) return { match: m, matchedBy: "name" };
  }
  return null;
}

/** An existing ACTIVE product with this barcode blocks creating another (DB unique index). */
export function barcodeTakenBy(value, existing, { excludeId = null } = {}) {
  const barcode = value?.barcode ? identifierKey(value.barcode) : "";
  if (!barcode) return null;
  return (
    (existing || []).find(
      (e) =>
        e.id !== excludeId &&
        e.barcode &&
        identifierKey(e.barcode) === barcode &&
        (e.item_type == null || e.item_type === "product") &&
        e.is_active !== false
    ) || null
  );
}

export const ROW_STATUS = Object.freeze({ READY: "ready", WARNING: "warning", ERROR: "error", DUPLICATE: "duplicate" });
export const DUPLICATE_ACTIONS = Object.freeze({ SKIP: "skip", UPDATE: "update", CREATE: "create" });

/**
 * Review status: ERROR beats DUPLICATE beats WARNING beats READY.
 * @param {{ errors: any[], warnings: any[] }} validation
 * @param {boolean} isDuplicate
 */
export function rowStatus(validation, isDuplicate) {
  if (validation.errors.length) return ROW_STATUS.ERROR;
  if (isDuplicate) return ROW_STATUS.DUPLICATE;
  if (validation.warnings.length) return ROW_STATUS.WARNING;
  return ROW_STATUS.READY;
}

/**
 * The catalogue columns an import writes. `onlyProvided` (updates) keeps just the fields that
 * had a value in this row — an update never blanks an existing field.
 * @param {ReturnType<typeof validateImportRow>["value"]} value
 * @param {{ itemType: "product" | "service", provided: string[], onlyProvided?: boolean }} opts
 */
export function catalogColumnsForImport(value, { itemType, provided, onlyProvided = false }) {
  const has = (field) => !onlyProvided || provided.includes(field);
  const out = {};
  if (has("name") && value.name) out.name = value.name;
  if (has("sku") && value.sku) out.sku = value.sku;
  if (has("description") && value.description) out.description = value.description;
  if (has("category") && value.category) out.category = value.category;
  if (has("price") && value.price != null) {
    out.price = value.price;
    out.default_rate = value.price;
    out.rate = value.price;
    out.unit_price = value.price;
  }
  if (has("vat") && value.tax_category) out.tax_category = value.tax_category;
  if (has("unit") && value.unit) {
    out.default_unit = value.unit;
    if (itemType === "service") out.unit_of_measure = value.unit;
  }
  if (itemType === "product") {
    if (has("cost_price") && value.cost_price != null) out.cost_price = value.cost_price;
    if (has("barcode") && value.barcode) out.barcode = value.barcode;
  }
  return out;
}

/** Idempotency key stored on services.import_ref: one per (import, source row). */
export function importRef(importId, rowNumber) {
  return `${String(importId).toLowerCase()}:${Number(rowNumber)}`;
}
