/**
 * Shared display helpers for invoice/quote Document Preview + PDF.
 * Does not change persisted data — only what clients see on the document.
 */

/**
 * Always show a readable quantity (never blank). Integer when whole.
 * @param {unknown} value
 * @returns {string}
 */
export function formatDocumentLineQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "1";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

/**
 * Drop accidental keyboard mash / barcode noise from notes and free-text fields
 * when rendering documents. Does not rewrite stored values.
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeDocumentDisplayText(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isLikelyAccidentalNoise(line))
    .join("\n")
    .trim();
}

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isLikelyAccidentalNoise(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  // Long digit-only strings (scanner / barcode dumps)
  if (/^\d{16,}$/.test(t)) return true;
  // Keyboard mash: no spaces, mostly letters, few unique characters
  if (!/\s/.test(t) && t.length >= 12 && /^[a-z]+$/i.test(t)) {
    const unique = new Set(t.toLowerCase()).size;
    if (unique <= 6) return true;
  }
  return false;
}

/**
 * Coerce a commercial line into a complete preview/PDF row.
 * @param {object} row
 * @returns {{ description: string, quantity: number, unit_price: number, total: number }}
 */
export function coerceDocumentLineRow(row) {
  const qtyRaw = Number(row?.quantity ?? row?.qty);
  const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const unit = Number(row?.unit_price ?? row?.rate ?? row?.price ?? 0);
  const unit_price = Number.isFinite(unit) ? unit : 0;
  const rawTotal = row?.total_price ?? row?.total;
  const hasExplicit =
    rawTotal != null && rawTotal !== "" && Number.isFinite(Number(rawTotal));
  const total = hasExplicit
    ? Number(rawTotal)
    : Math.round(quantity * unit_price * 100) / 100;
  const description = String(row?.description ?? "").trim() || "Item";
  return { description, quantity, unit_price, total };
}
