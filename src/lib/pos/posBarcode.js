import { normalizePosCode } from "./posProductSearch.js";

/**
 * Generate a 13-character numeric barcode as a STRING.
 * Never coerce through Number — leading zeros must survive.
 */
export function generatePosProductBarcode() {
  const bytes = new Uint8Array(13);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let digits = "";
  for (let i = 0; i < bytes.length; i += 1) digits += String(bytes[i] % 10);
  return digits;
}

export function displayPosBarcode(value) {
  return String(value ?? "").trim();
}

export function activeProductHasBarcode(products, barcode, { excludeId } = {}) {
  const key = normalizePosCode(barcode);
  if (!key) return false;
  return (Array.isArray(products) ? products : []).some((row) => {
    if (!row || row.id === excludeId) return false;
    if (row.is_active === false) return false;
    if (row.item_type && row.item_type !== "product") return false;
    return normalizePosCode(row.barcode) === key;
  });
}
