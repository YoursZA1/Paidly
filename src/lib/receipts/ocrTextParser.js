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

/** Signed money, including "-R5.00" and "R 1 234,56". The whole match is parsed so the sign is not dropped. */
const AMOUNT_RE = /-?\s*(?:R|ZAR)\s*-?\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{2}|-?\s*(?:R|ZAR)\s*-?\d+[.,]\d{2}(?!\d)|-?\d{1,3}(?:[ \u00a0]\d{3})+[.,]\d{2}|-?\d+[.,]\d{2}(?!\d)/gi;

/**
 * Thermal-slip OCR confusions, fixed only inside an R-prefixed amount (never in times like 14:35):
 *   "RO.08" → "R0.08" (letter O for zero), "-R32:10" → "-R32.10", "R8 87" → "R8.87" (two digits = cents).
 * @param {string} line
 */
export function fixOcrAmountConfusions(line) {
  return line
    .replace(/(\bR|\bZAR)(\s*-?)([O0-9][O0-9]*)(?=[.,:\s]\d{2}(?!\d))/gi, (_m, cur, sign, digits) => `${cur}${sign}${digits.replace(/O/gi, "0")}`)
    .replace(/(\bR\s*-?\d{1,6}):(\d{2})(?!\d)/gi, "$1.$2")
    .replace(/(\bR\s*-?\d{1,4}) (\d{2})(?![\d,.])/gi, "$1.$2");
}

/** @param {string} line */
function amountsIn(line) {
  const out = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const n = parseMoney(m[0]);
    if (n != null && n !== 0) out.push(n);
  }
  return out;
}

const NOT_TOTAL = /sub\s*-?\s*total|total\s*(vat|tax|items?|qty|savings?|discount|excl|ex\b|tendered)|items?\s*total/i;
const TOTAL = /\b(grand\s*total|total\s*(due|incl|inc|amount)?|amount\s*(due|payable)|balance\s*due|to\s*pay|total)\b/i;
/** "TOTAL (2)" is the sale total for 2 items, not an item count to skip. */
const ITEM_COUNT_TOTAL = /\btotal\s*[([]\s*\d{1,4}\s*[)\]]/i;
const SUBTOTAL = /\b(sub\s*-?\s*total|total\s*excl?\.?|excl?\.?\s*vat|amount\s*excl|net\s*amount|taxable\s*amount)\b/i;
const VAT_LINE = /\b(vat|tax|gst)\b/i;
const VAT_NUMBER_LINE = /\b(vat|tax)\s*(reg(istration)?|no|number|nr|#)\b/i;
const HEADER_NOISE = /(tax\s*invoice|receipt|welcome|thank|tel\b|phone|fax|vat\s*(no|reg)|www\.|@|\bslip\b|till|cashier|date|time)/i;
/** What the customer handed over. Never the sale total, even when it is the largest number on the slip. */
const TENDER = /\b(cash\s*rounding|rounding|change|amount\s*tendered|tendered|tender|cash|tip|gratuity)\b/i;
const ITEM_SKIP = /\b(total|sub\s*-?\s*total|vat|tax|gross|net|rate|cash|change|rounding|tender|invoice|receipt|tel|phone|saved|thank|vat\s*no|debit|credit|eft|cheque|visa|mastercard)\b/i;

/**
 * Shoprite / Checkers style tax summary: headings on one line, figures on the next
 * (or both smashed onto one line by OCR). NET is before VAT, TAX is the VAT, GROSS is the total.
 * @param {string[]} lines
 */
function readTillTaxSummary(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].toUpperCase();
    if (!/\bRATE\b/.test(header) || !/\bTAX\b/.test(header) || !/\bGROSS\b/.test(header)) continue;
    const valueLine = /\d/.test(lines[i].slice(header.search(/\bNET\b|\bGROSS\b|\bTAX\b/))) && amountsIn(lines[i]).length >= 2
      ? lines[i]
      : lines[i + 1] || "";
    const amounts = amountsIn(valueLine).filter((n) => n > 0);
    const rateMatch = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(valueLine);
    let rate = rateMatch ? parseMoney(rateMatch[1]) : undefined;
    const money = [...amounts];
    if (rate == null && money.length >= 4 && money[0] > 0 && money[0] <= 30) {
      rate = money.shift();
    }
    const order = ["TAX", "GROSS", "NET"]
      .map((name) => ({ name, idx: header.search(new RegExp(`\\b${name}\\b`)) }))
      .filter((col) => col.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .map((col) => col.name);
    if (money.length < order.length) continue;
    const picked = money.slice(0, order.length);
    /** @type {Record<string, number>} */
    const col = {};
    order.forEach((name, idx) => {
      col[name] = picked[idx];
    });
    if (col.GROSS == null || col.TAX == null) continue;
    const subtotal = col.NET;
    const agrees = subtotal == null || Math.abs(subtotal + col.TAX - col.GROSS) <= 0.15;
    return {
      vatRate: rate ?? undefined,
      vatAmount: col.TAX,
      total: col.GROSS,
      subtotal,
      agrees,
    };
  }
  return null;
}

/**
 * Amount on this line, or the only amount on the next line when OCR splits a column.
 * @param {string[]} lines
 * @param {number} index
 */
function labelledAmount(lines, index) {
  const here = amountsIn(lines[index]).filter((n) => n > 0);
  if (here.length) return here[here.length - 1];
  const next = lines[index + 1];
  if (!next || TOTAL.test(next) || SUBTOTAL.test(next) || VAT_LINE.test(next) || TENDER.test(next) || /\b(rate|gross|net)\b/i.test(next)) {
    return undefined;
  }
  const there = amountsIn(next).filter((n) => n > 0);
  return there.length === 1 ? there[0] : undefined;
}

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
    .map((l) => fixOcrAmountConfusions(l.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
  const base = Math.max(0, Math.min(1, (Number(opts.confidence) || 0) / 100));
  const allAmounts = lines.flatMap(amountsIn);
  const date = findDate(lines);

  // Nothing legible. On-device OCR cannot tell "not a receipt" from "a receipt we could not read", so it
  // never claims the former: an empty result means "we couldn't read this clearly" (only the server
  // model may say a document is not a receipt).
  if (!allAmounts.length && !date) {
    return {};
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

  const vatNo = /\b(\d{10})\b/.exec(lines.filter((l) => VAT_NUMBER_LINE.test(l)).join(" "));
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
  let countedTotal;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (TENDER.test(line) && !ITEM_COUNT_TOTAL.test(line)) continue;
    const last = labelledAmount(lines, i);
    if (last == null) continue;
    if (SUBTOTAL.test(line)) {
      subtotal = last;
    } else if (
      VAT_LINE.test(line) &&
      !VAT_NUMBER_LINE.test(line) &&
      !/tax\s*invoice/i.test(line) &&
      // "TOTAL INCL VAT 80.92" is a total; "VAT 15% INCLUDED 10.55" / "VAT INCL @15% R6,39" is the VAT.
      !(/incl/i.test(line) && /\b(total|amount|price|due)\b/i.test(line)) &&
      !/\bgross\b/i.test(line)
    ) {
      vat = last;
      const rate = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(line);
      if (rate) vatRate = parseMoney(rate[1]) ?? undefined;
    } else if (ITEM_COUNT_TOTAL.test(line) || (TOTAL.test(line) && !NOT_TOTAL.test(line))) {
      if (ITEM_COUNT_TOTAL.test(line)) countedTotal = last;
      total = last; // last labelled total wins (receipts repeat it after tender lines)
    }
  }

  const taxSummary = readTillTaxSummary(lines);
  let totalsDisagree = false;
  if (taxSummary) {
    if (taxSummary.agrees) {
      subtotal = taxSummary.subtotal ?? subtotal;
      vat = taxSummary.vatAmount;
      total = taxSummary.total;
      if (taxSummary.vatRate != null) vatRate = taxSummary.vatRate;
      if (countedTotal != null && Math.abs(countedTotal - taxSummary.total) > 0.15) totalsDisagree = true;
    } else if (total == null) {
      total = taxSummary.total;
      vat = taxSummary.vatAmount;
      subtotal = taxSummary.subtotal ?? subtotal;
      totalsDisagree = true;
    }
  }

  if (total !== undefined) {
    raw.total = total;
    conf.total = totalsDisagree ? Math.min(base * 0.9, 0.45) : base * 0.9;
  }
  if (subtotal !== undefined) {
    raw.subtotal = subtotal;
    conf.subtotal = totalsDisagree ? Math.min(base * 0.85, 0.45) : base * 0.85;
  }
  if (vat !== undefined) {
    raw.vatAmount = vat;
    conf.vatAmount = totalsDisagree ? Math.min(base * 0.85, 0.45) : base * 0.85;
    if (vatRate !== undefined) raw.vatRate = vatRate;
  }

  const items = [];
  for (const line of lines) {
    if (ITEM_SKIP.test(line) || TENDER.test(line)) continue;
    const amounts = amountsIn(line);
    if (amounts.length !== 1) continue;
    const description = line
      .replace(AMOUNT_RE, " ")
      .replace(/[^\p{L}\p{N}&'().,\- ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (description.length < 3 || !/[a-z]/i.test(description)) continue;
    items.push({ description: description.slice(0, 200), amount: amounts[0] });
  }
  if (items.length) raw.lineItems = items.slice(0, 50);

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
  return normalized.ok ? normalized.extraction : {};
}
