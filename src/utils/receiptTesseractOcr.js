/**
 * Browser-based receipt OCR using tesseract.js.
 * Lazy-loads tesseract to keep initial bundle small.
 * Parses raw OCR text into vendor, date, total, vat, currency, category.
 */

import { RECEIPT_OCR_CATEGORIES } from "@/constants/receiptOcrExtractionSpec";

function parseAmount(str) {
  if (!str || typeof str !== "string") return null;
  const normalized = str.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractAmounts(text) {
  const amounts = [];
  let m;
  const re = /(?:R|ZAR|\$|USD)?\s*([\d\s]+[.,]\d{2})/g;
  while ((m = re.exec(text)) !== null) {
    const a = parseAmount(m[1]);
    if (a != null && a < 1e6) amounts.push(a);
  }
  return amounts;
}

/** Match "total R 245.80" or "total 245.80" - used by parseReceipt and findTotal */
const TOTAL_REGEX = /total\s*R?\s*(\d+[.,]\d+)/i;

function findTotal(text) {
  const totalMatch = text.match(TOTAL_REGEX);
  if (totalMatch) {
    const n = parseAmount(totalMatch[1]);
    if (n != null) return n;
  }
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].toLowerCase();
    if (line.includes("total") || line.includes("amount due") || line.includes("grand total")) {
      const amounts = extractAmounts(lines[i]);
      if (amounts.length > 0) return Math.max(...amounts);
    }
  }
  const amounts = extractAmounts(text);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/**
 * Parse receipt text into total and raw (example pattern from Receipt Upload Component).
 * Use this for a simple result display: { total, raw }.
 * @param {string} text - Raw OCR text
 * @returns {{ total: string | null, raw: string }}
 */
export function parseReceipt(text) {
  const raw = text || "";
  const totalMatch = raw.match(TOTAL_REGEX);
  const total = totalMatch ? totalMatch[1].replace(",", ".") : null;
  return { total, raw };
}

function findVat(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("vat") || lower.includes("tax") || lower.includes("gst")) {
      const amounts = extractAmounts(line);
      if (amounts.length > 0) return amounts[amounts.length - 1];
    }
  }
  return null;
}

function findDate(text) {
  // ISO
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(text);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? (parseInt(y, 10) < 50 ? "20" + y : "19" + y) : y;
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
}

function findVendor(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (line.length > 2 && line.length < 60 && !/^\d+[.,]\d{2}$/.test(line) && !/^\d{4}-\d{2}-\d{2}$/.test(line)) {
      return line;
    }
  }
  return "";
}

function detectCurrency(text) {
  const t = text.toUpperCase();
  if (/\bZAR\b|R\s*\d|R\d/.test(t)) return "ZAR";
  if (/\bUSD\b|\$\s*\d/.test(t)) return "USD";
  if (/\bGBP\b|£\s*\d/.test(t)) return "GBP";
  if (/\bEUR\b|€\s*\d/.test(t)) return "EUR";
  return "ZAR";
}

function inferCategory(text, vendor) {
  const combined = `${(vendor || "").toLowerCase()} ${(text || "").toLowerCase()}`;
  if (/office|supplies|stationery|pick n pay|checkers|shoprite|spar/.test(combined)) return "supplies";
  if (/travel|flight|uber|petrol|fuel/.test(combined)) return "travel";
  if (/utility|electric|water|telkom/.test(combined)) return "utilities";
  if (/software|subscription|microsoft|google|adobe/.test(combined)) return "software";
  if (/meal|restaurant|cafe|food/.test(combined)) return "meals";
  if (/vehicle|car|maintenance/.test(combined)) return "vehicle";
  return "other";
}

/**
 * Convert raw OCR text into structured receipt data. Safe to run in a Web Worker.
 * @param {string} text - Raw OCR text
 * @returns {{ vendor_name: string, date: string | null, total: number | null, vat: number | null, currency: string, category: string, description: string, raw: string }}
 */
export function extractReceiptDataFromText(text) {
  const raw = text || "";
  const { total: totalFromParse } = parseReceipt(raw);
  const total = findTotal(raw) ?? (totalFromParse ? parseFloat(totalFromParse) : null);
  const vat = findVat(raw);
  const date = findDate(raw);
  const vendor = findVendor(raw);
  const currency = detectCurrency(raw);
  const category = inferCategory(raw, vendor);
  const validCategory = RECEIPT_OCR_CATEGORIES.includes(category) ? category : "other";
  return {
    vendor_name: vendor,
    date: date || null,
    total,
    vat: vat ?? null,
    currency,
    category: validCategory,
    description: vendor ? `Receipt from ${vendor}` : "Receipt",
    raw,
  };
}

/**
 * Run Tesseract OCR inside a Web Worker to avoid blocking the main thread.
 * @param {File} file - Image file (PNG, JPG, etc.; PDF not supported by tesseract in browser)
 * @param {{ logger?: (m: unknown) => void }} options - Optional logger for progress (e.g. m => console.log(m))
 * @returns {Promise<{ vendor_name: string, date: string | null, total: number | null, vat: number | null, currency: string, category: string, description: string, raw: string }>}
 */
export async function extractReceiptDataWithTesseract(file, options = {}) {
  const worker = new Worker(
    new URL("../workers/receiptOcr.worker.js", import.meta.url),
    { type: "module" }
  );
  const arrayBuffer = await file.arrayBuffer();
  const logger = options.logger ?? (() => {});

  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const { result, progress, error } = e.data ?? {};
      if (error) {
        worker.terminate();
        reject(new Error(error));
        return;
      }
      if (progress != null) logger(progress);
      if (result != null) {
        worker.terminate();
        resolve(result);
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage(
      { arrayBuffer, mimeType: file.type || "image/png" },
      [arrayBuffer]
    );
  });
}
