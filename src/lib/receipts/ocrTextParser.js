/**
 * On-device OCR text → ReceiptExtraction. Only labelled values are taken ("TOTAL", "VAT", "Subtotal");
 * nothing is inferred from "the biggest number on the slip". Confidence combines Tesseract's own score
 * with how the value was found, so weak reads show as "Needs review".
 */
import {
  normalizePaymentMethod,
  normalizeReceiptExtraction,
  parseMoney,
  parseReceiptDate,
  validateReceiptAmounts,
} from "@shared/expenses/receiptScan.js";

const AMOUNT_RE = /(?:R\s?)?(-?\d{1,3}(?:[ ,]\d{3})+[.,]\d{2}|-?\d+[.,]\d{2})(?!\d)/g;

/** @param {string} line */
function amountsIn(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const n = parseMoney(m[1]);
    if (n != null) out.push(n);
  }
  return out;
}

const NOT_TOTAL = /sub\s*-?\s*total|total\s*(vat|tax|items?|qty|savings?|discount|excl|ex\b|tendered)|items?\s*total/i;
const TOTAL = /\b(grand\s*total|total\s*(due|incl|inc|amount)?|amount\s*(due|payable)|balance\s*due|to\s*pay|total)\b/i;
const SUBTOTAL = /\b(sub\s*-?\s*total|total\s*excl?\.?|excl?\.?\s*vat|amount\s*excl|net\s*amount|taxable\s*amount)\b/i;
const VAT_LINE = /\b(vat|tax|gst)\b/i;
const VAT_NUMBER_LINE = /\b(vat|tax)\s*(reg(istration)?|no|number|nr|#)\b/i;
const HEADER_NOISE = /(tax\s*invoice|receipt|welcome|thank|tel\b|phone|fax|vat\s*(no|reg)|www\.|@|\bslip\b|till|cashier|date|time)/i;

/** @param {string[]} lines */
function findDate(lines) {
  const patterns = [
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
    /\b(\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4})\b/,
    /\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4})\b/,
  ];
  for (const line of lines) {
    for (const re of patterns) {
      const m = re.exec(line);
      const iso = m ? parseReceiptDate(m[1]) : null;
      if (iso) return iso;
    }
  }
  return null;
}

/**
 * @param {string} text raw OCR text
 * @param {{ confidence?: number }} [opts] Tesseract mean confidence 0–100
 * @returns {import("@shared/expenses/receiptScan.js").ReceiptExtraction}
 */
export function parseReceiptOcrText(text, opts = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const base = Math.max(0, Math.min(1, (Number(opts.confidence) || 0) / 100));
  const allAmounts = lines.flatMap(amountsIn);
  const date = findDate(lines);

  if (!allAmounts.length && !date) {
    return { isReceipt: false };
  }

  /** @type {Record<string, unknown>} */
  const raw = { isReceipt: true, confidence: {} };
  const conf = /** @type {Record<string, number>} */ (raw.confidence);

  const merchant = lines
    .slice(0, 6)
    .find((l) => /[a-z]{3,}/i.test(l) && l.length <= 60 && !HEADER_NOISE.test(l) && amountsIn(l).length === 0 && !/^\d/.test(l));
  if (merchant) {
    raw.merchantName = merchant.replace(/[^\p{L}\p{N}&'().,\- ]/gu, "").trim();
    conf.merchantName = base * 0.7;
  }

  const vatNo = /\b(4\d{9})\b/.exec(lines.filter((l) => VAT_NUMBER_LINE.test(l)).join(" "));
  if (vatNo) raw.supplierVatNumber = vatNo[1];

  const REF_RE = /\b(?:receipt|invoice|inv|slip|trans(?:action)?|doc(?:ument)?|ref)[ \t]*(?:no|number|nr|#)?\.?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\-/]{2,24})\b/gi;
  for (const line of lines) {
    const ref = [...line.matchAll(REF_RE)].find((m) => /\d/.test(m[1]));
    if (ref) {
      raw.receiptNumber = ref[1];
      break;
    }
  }

  if (date) {
    raw.transactionDate = date;
    conf.date = base * 0.9;
  }

  let total;
  let subtotal;
  let vat;
  let vatRate;
  for (const line of lines) {
    const amounts = amountsIn(line);
    if (!amounts.length) continue;
    const last = amounts[amounts.length - 1];
    if (SUBTOTAL.test(line)) {
      subtotal = last;
    } else if (VAT_LINE.test(line) && !VAT_NUMBER_LINE.test(line) && !/incl/i.test(line)) {
      vat = last;
      const rate = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line);
      if (rate) vatRate = parseMoney(rate[1]) ?? undefined;
    } else if (TOTAL.test(line) && !NOT_TOTAL.test(line)) {
      total = last; // last labelled total wins (receipts repeat it after tender lines)
    }
  }
  if (total !== undefined) {
    raw.total = total;
    conf.total = base * 0.9;
  }
  if (subtotal !== undefined) {
    raw.subtotal = subtotal;
    conf.subtotal = base * 0.85;
  }
  if (vat !== undefined) {
    raw.vatAmount = vat;
    conf.vatAmount = base * 0.85;
    if (vatRate !== undefined) raw.vatRate = vatRate;
  }

  // Amounts that add up are much more likely to be read correctly.
  if (total !== undefined && validateReceiptAmounts({ subtotal, vatAmount: vat, total }).status === "consistent" && vat !== undefined) {
    conf.total = Math.max(conf.total, 0.9);
    conf.vatAmount = Math.max(conf.vatAmount ?? 0, 0.9);
    if (subtotal !== undefined) conf.subtotal = Math.max(conf.subtotal ?? 0, 0.9);
  }

  const joined = lines.join(" ");
  if (/\bR\s?\d|\bZAR\b/.test(joined)) raw.currency = "ZAR";
  const payLine = lines.find((l) => /\b(cash|credit|debit|eft|cheque)\b/i.test(l));
  const method = payLine ? normalizePaymentMethod(payLine) : undefined;
  if (method && method !== "other") raw.paymentMethod = method;

  const normalized = normalizeReceiptExtraction(raw);
  return normalized.ok ? normalized.extraction : { isReceipt: false };
}
