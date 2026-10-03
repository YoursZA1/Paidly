// @ts-check
/**
 * Scan Receipt — the pure rules shared by the browser review screen and the server confirm route.
 *
 *   Receipt image → extraction (any provider) → normalizeReceiptExtraction → review → confirm
 *
 * Nothing here talks to Supabase, a model or the DOM. The server re-runs every check in
 * validateReceiptExpenseSubmission, so the browser copy is only for instant feedback.
 *
 * Provider output is untrusted: normalizeReceiptExtraction keeps only known fields with the right
 * shape and never fills in a value the provider did not return.
 */

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIN_DIMENSION = 200;
export const RECEIPT_MAX_DIMENSION = 12_000;

/** What the receipts bucket accepts (supabase/migrations/20250319000000_receipts_bucket.sql, minus GIF). */
export const RECEIPT_MIME_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
});

export const RECEIPT_EXTENSIONS = Object.freeze(["jpg", "jpeg", "png", "webp", "pdf"]);

/**
 * Version of the receipt reading rules (prompt + normalisation + on-device parser). Stored on every
 * scanned expense (receipt_review.extraction_version) so older records stay explainable when the rules
 * improve. Bump when extraction behaviour changes.
 */
export const RECEIPT_EXTRACTION_VERSION = "v2";

/**
 * Real file type from its first bytes — the browser's MIME label and the extension are not trusted.
 * @param {Uint8Array | ArrayLike<number> | null | undefined} head at least the first 12 bytes
 * @returns {"image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null}
 */
export function sniffReceiptMediaType(head) {
  if (!head || head.length < 4) return null;
  const b = (i) => Number(head[i]);
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (head.length >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46
    && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  if (head.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) {
    return "application/pdf";
  }
  return null;
}

/** Cash rounding (10c) plus per-line rounding on till slips. */
export const RECEIPT_ROUNDING_TOLERANCE = 0.1;

const MAX_AMOUNT = 10_000_000;
const MIN_DATE = "2000-01-01";

/** Existing expense categories (ExpenseForm / ExpenseList / CSV import). Not extended here. */
export const RECEIPT_EXPENSE_CATEGORIES = Object.freeze([
  { value: "office", label: "Office" },
  { value: "supplies", label: "Supplies & stock" },
  { value: "travel", label: "Travel" },
  { value: "vehicle", label: "Vehicle & fuel" },
  { value: "meals", label: "Meals & entertainment" },
  { value: "software", label: "Software" },
  { value: "marketing", label: "Marketing & advertising" },
  { value: "utilities", label: "Utilities" },
  { value: "consulting", label: "Professional services" },
  { value: "legal", label: "Legal" },
  { value: "maintenance", label: "Maintenance & equipment" },
  { value: "salary", label: "Salary" },
  { value: "other", label: "Other" },
]);

const CATEGORY_VALUES = new Set(RECEIPT_EXPENSE_CATEGORIES.map((c) => c.value));

export const RECEIPT_PAYMENT_METHODS = Object.freeze([
  { value: "cash", label: "Cash" },
  { value: "eft", label: "EFT" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit_card", label: "Credit card" },
  { value: "debit_card", label: "Debit card" },
  { value: "check", label: "Cheque" },
  { value: "other", label: "Other" },
]);

const PAYMENT_METHOD_VALUES = new Set(RECEIPT_PAYMENT_METHODS.map((m) => m.value));

// ── Primitive parsing ──────────────────────────────────────────────────────────────────────

/** @param {unknown} value */
function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** @param {number} n */
export function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * "R 1 234,56", "1,234.56", "1.234,56", 245.8 → number. Anything ambiguous or non-numeric → null.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/[\s\u00a0']/g, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")") && s.length > 2) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^(?:ZAR|R|USD|\$|EUR|€|GBP|£)/i, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // The later separator is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // 1,234 / 1,234,567 → thousands; 12,50 → decimal comma.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if ((s.match(/\./g) || []).length > 1) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return roundMoney(negative ? -n : n);
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** @param {number} y @param {number} m @param {number} d */
function isoIfValid(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** @param {number} y */
function fullYear(y) {
  return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
}

/**
 * Receipt date → "YYYY-MM-DD". Day-first for slashed dates (South African receipts).
 * Returns null for anything that is not a real calendar date — never "today".
 * @param {unknown} value
 * @returns {string | null}
 */
export function parseReceiptDate(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/.exec(s);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) return isoIfValid(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[/** @type {keyof typeof MONTHS} */ (m[2].slice(0, m[2].startsWith("sept") ? 4 : 3))];
    return month ? isoIfValid(fullYear(Number(m[3])), month, Number(m[1])) : null;
  }
  m = /^([a-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[/** @type {keyof typeof MONTHS} */ (m[1].slice(0, m[1].startsWith("sept") ? 4 : 3))];
    return month ? isoIfValid(fullYear(Number(m[3])), month, Number(m[2])) : null;
  }
  return null;
}

/**
 * @param {Date} [now]
 * @returns {string} today's date in South Africa (SAST), YYYY-MM-DD
 */
export function todayIso(now = new Date()) {
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} days */
function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** @param {unknown} value @param {number} max */
function cleanText(value, max) {
  if (typeof value !== "string") return undefined;
  // Strip control characters; collapse whitespace.
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

/** @param {unknown} value */
function cleanAmount(value) {
  const n = parseMoney(/** @type {any} */ (value));
  if (n == null || n < 0 || n > MAX_AMOUNT) return undefined;
  return n;
}

/** Confidence as 0..1 (accepts 0..100). @param {unknown} value */
function cleanConfidence(value) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  const scaled = n > 1 ? n / 100 : n;
  return scaled > 1 ? undefined : Math.round(scaled * 100) / 100;
}

// ── Extraction normalisation ────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   merchantName?: string,
 *   supplierName?: string,
 *   supplierVatNumber?: string,
 *   receiptNumber?: string,
 *   invoiceNumber?: string,
 *   transactionDate?: string,
 *   subtotal?: number,
 *   vatAmount?: number,
 *   total?: number,
 *   vatRate?: number,
 *   currency?: string,
 *   paymentMethod?: string,
 *   lineItems?: Array<{ description: string, quantity?: number, unitPrice?: number, amount?: number }>,
 *   suggestedCategory?: string,
 *   isReceipt?: boolean,
 *   confidence?: { merchantName?: number, date?: number, subtotal?: number, vatAmount?: number, total?: number, category?: number }
 * }} ReceiptExtraction
 */

const CONFIDENCE_KEYS = ["merchantName", "date", "subtotal", "vatAmount", "total", "category"];

/** Accept snake_case from older providers without widening what we keep. */
const ALIASES = {
  merchantName: ["merchantName", "merchant_name", "vendor_name", "vendor", "merchant"],
  supplierName: ["supplierName", "supplier_name"],
  supplierVatNumber: ["supplierVatNumber", "supplier_vat_number", "vat_number"],
  receiptNumber: ["receiptNumber", "receipt_number"],
  invoiceNumber: ["invoiceNumber", "invoice_number"],
  transactionDate: ["transactionDate", "transaction_date", "date"],
  subtotal: ["subtotal", "sub_total"],
  vatAmount: ["vatAmount", "vat_amount", "vat", "tax"],
  total: ["total", "total_amount", "amount"],
  vatRate: ["vatRate", "vat_rate"],
  currency: ["currency"],
  paymentMethod: ["paymentMethod", "payment_method"],
  lineItems: ["lineItems", "line_items"],
  suggestedCategory: ["suggestedCategory", "suggested_category", "category"],
  isReceipt: ["isReceipt", "is_receipt"],
  confidence: ["confidence"],
};

/** @param {Record<string, unknown>} raw @param {keyof typeof ALIASES} key */
function pick(raw, key) {
  for (const alias of ALIASES[key]) {
    if (Object.prototype.hasOwnProperty.call(raw, alias) && raw[alias] !== undefined) return raw[alias];
  }
  return undefined;
}

/** Map a provider's payment wording to a Paidly payment method. @param {unknown} value */
export function normalizePaymentMethod(value) {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!s) return undefined;
  if (PAYMENT_METHOD_VALUES.has(s)) return s;
  if (/cash/.test(s)) return "cash";
  if (/credit/.test(s)) return "credit_card";
  if (/debit|maestro/.test(s)) return "debit_card";
  // A bare "card"/"Visa" doesn't say credit or debit: leave it for the person to choose.
  if (/card|visa|master|amex|tap|contactless|speedpoint/.test(s)) return undefined;
  if (/eft|instant ?eft|ozow/.test(s)) return "eft";
  if (/transfer|bank/.test(s)) return "bank_transfer";
  if (/cheque|check/.test(s)) return "check";
  return "other";
}

/**
 * Validate + coerce provider output. Unknown keys are dropped, wrong types become "missing".
 * Never invents: a field absent in `raw` is absent in the result.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, extraction: ReceiptExtraction, issues: string[] } | { ok: false, extraction: null, issues: string[] }}
 */
export function normalizeReceiptExtraction(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, extraction: null, issues: ["not_an_object"] };
  }
  const src = /** @type {Record<string, unknown>} */ (raw);
  /** @type {ReceiptExtraction} */
  const out = {};
  /** @type {string[]} */
  const issues = [];

  const text = (/** @type {keyof typeof ALIASES} */ key, max) => {
    const v = pick(src, key);
    if (v === undefined || v === null) return;
    const cleaned = cleanText(v, max);
    if (cleaned === undefined) {
      if (!isBlank(v)) issues.push(`${key}_invalid`);
      return;
    }
    /** @type {any} */ (out)[key] = cleaned;
  };
  text("merchantName", 120);
  text("supplierName", 120);
  text("supplierVatNumber", 30);
  text("receiptNumber", 60);
  text("invoiceNumber", 60);

  const rawDate = pick(src, "transactionDate");
  if (!isBlank(rawDate)) {
    const iso = parseReceiptDate(typeof rawDate === "string" ? rawDate : "");
    if (iso && iso >= MIN_DATE) out.transactionDate = iso;
    else issues.push("transactionDate_invalid");
  }

  for (const key of /** @type {const} */ (["subtotal", "vatAmount", "total"])) {
    const v = pick(src, key);
    if (isBlank(v)) continue;
    const n = cleanAmount(v);
    if (n === undefined) issues.push(`${key}_invalid`);
    else out[key] = n;
  }

  const rate = pick(src, "vatRate");
  if (!isBlank(rate)) {
    let r = typeof rate === "number" ? rate : parseMoney(String(rate).replace("%", ""));
    if (r != null && r > 0 && r < 1) r = r * 100;
    if (r != null && Number.isFinite(r) && r >= 0 && r <= 100) out.vatRate = Math.round(r * 1000) / 1000;
    else issues.push("vatRate_invalid");
  }

  const currency = pick(src, "currency");
  if (typeof currency === "string" && /^[a-z]{3}$/i.test(currency.trim())) {
    out.currency = currency.trim().toUpperCase();
  } else if (typeof currency === "string" && /^r$/i.test(currency.trim())) {
    out.currency = "ZAR";
  } else if (!isBlank(currency)) {
    issues.push("currency_invalid");
  }

  const payment = normalizePaymentMethod(pick(src, "paymentMethod"));
  if (payment) out.paymentMethod = payment;

  const category = pick(src, "suggestedCategory");
  if (typeof category === "string" && category.trim()) {
    const mapped = mapCategoryLabel(category);
    if (mapped) out.suggestedCategory = mapped;
    else issues.push("suggestedCategory_unknown");
  }

  const isReceipt = pick(src, "isReceipt");
  if (typeof isReceipt === "boolean") out.isReceipt = isReceipt;

  const items = pick(src, "lineItems");
  if (Array.isArray(items)) {
    const cleanedItems = [];
    for (const item of items.slice(0, 100)) {
      if (!item || typeof item !== "object") continue;
      const it = /** @type {Record<string, unknown>} */ (item);
      const description = cleanText(it.description, 200);
      if (!description) continue;
      /** @type {{ description: string, quantity?: number, unitPrice?: number, amount?: number }} */
      const line = { description };
      const qty = typeof it.quantity === "number" ? it.quantity : parseMoney(/** @type {any} */ (it.quantity));
      if (qty != null && qty > 0 && qty < 100_000) line.quantity = qty;
      const unit = cleanAmount(it.unitPrice ?? it.unit_price);
      if (unit !== undefined) line.unitPrice = unit;
      const signed = parseMoney(/** @type {any} */ (it.amount));
      if (signed != null && signed !== 0 && signed >= -MAX_AMOUNT && signed <= MAX_AMOUNT) line.amount = signed;
      cleanedItems.push(line);
    }
    if (cleanedItems.length) out.lineItems = cleanedItems;
  } else if (items != null) {
    issues.push("lineItems_invalid");
  }

  const conf = pick(src, "confidence");
  if (conf && typeof conf === "object" && !Array.isArray(conf)) {
    /** @type {Record<string, number>} */
    const c = {};
    for (const key of CONFIDENCE_KEYS) {
      const v = cleanConfidence(/** @type {Record<string, unknown>} */ (conf)[key]);
      if (v !== undefined) c[key] = v;
    }
    if (Object.keys(c).length) out.confidence = c;
  }

  return { ok: true, extraction: out, issues };
}

/** True when the provider found nothing a person could use. @param {ReceiptExtraction | null | undefined} x */
export function isEmptyExtraction(x) {
  if (!x) return true;
  return x.total === undefined && x.subtotal === undefined && !x.merchantName && !x.supplierName && !x.transactionDate;
}

/**
 * How much of the receipt was actually read — drives the honest headline on the review screen.
 *   complete → total and date found;  partial → some key fields (total, date, merchant) found;
 *   none     → nothing usable (receipt attached, details typed by hand).
 * @param {ReceiptExtraction | null | undefined} x
 * @returns {{ level: "complete" | "partial" | "none", missing: Array<"total" | "date" | "merchant"> }}
 */
export function assessExtractionCompleteness(x) {
  if (!x || isEmptyExtraction(x)) return { level: "none", missing: ["total", "date", "merchant"] };
  /** @type {Array<"total" | "date" | "merchant">} */
  const missing = [];
  if (x.total === undefined) missing.push("total");
  if (!x.transactionDate) missing.push("date");
  if (!x.merchantName && !x.supplierName) missing.push("merchant");
  if (!missing.length) return { level: "complete", missing };
  // A merchant name alone is not a read receipt: the amounts are what matter.
  if (x.total === undefined && x.subtotal === undefined && !x.transactionDate) return { level: "none", missing };
  return { level: "partial", missing };
}

/**
 * high → shown as a normal field; medium → "Review"; low → "Needs review".
 * A key field that came back empty is always "low" so the person looks at it.
 * @param {number | undefined} score
 * @param {boolean} hasValue
 * @returns {"high" | "medium" | "low"}
 */
export function confidenceLevel(score, hasValue) {
  if (!hasValue) return "low";
  if (score === undefined) return "medium";
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

// ── VAT / totals ───────────────────────────────────────────────────────────────────────────

/**
 * Check what the receipt says about subtotal, VAT and total. Informational: it never derives a VAT
 * amount the receipt did not show, and it does not assume the business is VAT registered.
 *
 * @param {{ subtotal?: number | null, vatAmount?: number | null, total?: number | null, vatRate?: number | null }} input
 * @returns {{
 *   status: "consistent" | "mismatch" | "vat_missing" | "incomplete" | "invalid",
 *   issues: string[],
 *   expectedTotal?: number,
 *   difference?: number,
 *   impliedRate?: number,
 * }}
 */
export function validateReceiptAmounts(input) {
  const subtotal = input.subtotal ?? undefined;
  const vat = input.vatAmount ?? undefined;
  const total = input.total ?? undefined;
  const rate = input.vatRate ?? undefined;
  /** @type {string[]} */
  const issues = [];

  for (const [key, v] of /** @type {const} */ ([["subtotal", subtotal], ["vatAmount", vat], ["total", total]])) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) issues.push(`${key}_negative`);
  }
  if (issues.length) return { status: "invalid", issues };
  if (total === undefined || total <= 0) return { status: "incomplete", issues: ["total_missing"] };
  if (vat !== undefined && vat > total) return { status: "invalid", issues: ["vat_exceeds_total"] };
  if (subtotal !== undefined && subtotal > total + RECEIPT_ROUNDING_TOLERANCE) {
    return { status: "invalid", issues: ["subtotal_exceeds_total"] };
  }
  if (vat === undefined) return { status: "vat_missing", issues: ["vat_missing"] };

  const base = subtotal !== undefined ? subtotal : roundMoney(total - vat);
  const impliedRate = base > 0 ? Math.round((vat / base) * 10000) / 100 : undefined;
  if (vat > 0 && base > 0 && vat / total > 0.5) issues.push("vat_unusually_high");
  if (rate !== undefined && base > 0) {
    const expectedVat = roundMoney((base * rate) / 100);
    if (Math.abs(expectedVat - vat) > Math.max(RECEIPT_ROUNDING_TOLERANCE, expectedVat * 0.01)) {
      issues.push("vat_rate_mismatch");
    }
  }

  if (subtotal === undefined) {
    return { status: issues.length ? "mismatch" : "consistent", issues, impliedRate };
  }
  const expectedTotal = roundMoney(subtotal + vat);
  const difference = roundMoney(total - expectedTotal);
  if (Math.abs(difference) > RECEIPT_ROUNDING_TOLERANCE) {
    return { status: "mismatch", issues: ["totals_mismatch", ...issues], expectedTotal, difference, impliedRate };
  }
  return { status: issues.length ? "mismatch" : "consistent", issues, expectedTotal, difference, impliedRate };
}

// ── Category suggestion ─────────────────────────────────────────────────────────────────────

const LABEL_TO_CATEGORY = [
  [/^office|stationery|office supplies/, "office"],
  [/fuel|petrol|diesel|vehicle|toll|parking|car /, "vehicle"],
  [/travel|flight|accommodation|hotel|taxi|ride/, "travel"],
  [/meal|entertainment|restaurant|food|coffee|catering/, "meals"],
  [/software|subscription|saas|licen[cs]e|cloud|hosting/, "software"],
  [/advert|marketing|promotion/, "marketing"],
  [/utilit|electric|water|internet|data|airtime|telephone|phone/, "utilities"],
  [/professional|consult|accounting|bookkeeping/, "consulting"],
  [/legal|attorney/, "legal"],
  [/equipment|repair|maintenance|hardware|tools?$/, "maintenance"],
  [/stock|inventory|supplies|groceries|cleaning|packaging/, "supplies"],
  [/salary|wage|payroll/, "salary"],
  [/^other|misc/, "other"],
];

/** "Office Supplies" / "Fuel" / "office" → a Paidly category key, or undefined. @param {string} label */
export function mapCategoryLabel(label) {
  const s = String(label || "").trim().toLowerCase();
  if (!s) return undefined;
  if (CATEGORY_VALUES.has(s)) return s;
  for (const [re, value] of LABEL_TO_CATEGORY) {
    if (/** @type {RegExp} */ (re).test(s)) return /** @type {string} */ (value);
  }
  return undefined;
}

const MERCHANT_HINTS = [
  [/\b(engen|shell|sasol|caltex|astron|bp|total ?energies|puma energy|garage|fuel|petrol|filling station)\b/, "vehicle"],
  [/\b(uber|bolt|airlink|flysafair|safair|lift airline|airways|airport|hotel|lodge|guest ?house|protea|city lodge|avis|hertz|europcar|gautrain)\b/, "travel"],
  [/\b(restaurant|cafe|caf[eé]|coffee|nando'?s|steers|kfc|mcdonald'?s|wimpy|spur|vida e|seattle coffee|debonairs|roman'?s|ocean basket|mugg ?& ?bean|bistro|grill|pizza)\b/, "meals"],
  [/\b(eskom|municipality|city of|telkom|vodacom|mtn|cell ?c|rain|afrihost|openserve|webafrica|metro ?fibre|vumatel)\b/, "utilities"],
  [/\b(microsoft|google|adobe|apple\.com|aws|amazon web services|github|zoom|canva|xero|dropbox|slack|atlassian|openai|anthropic)\b/, "software"],
  [/\b(facebook|meta platforms|google ads|linkedin ads|printing|signage)\b/, "marketing"],
  [/\b(waltons|typo|cna|staples|officeworks|incredible connection|takealot)\b/, "office"],
  [/\b(builders|leroy merlin|cashbuild|buco|hardware|mica)\b/, "maintenance"],
  [/\b(makro|woolworths|checkers|pick ?n ?pay|spar|shoprite|food lover|game|dis-?chem|clicks)\b/, "supplies"],
];

/**
 * Suggest a category from what the receipt shows. Only a suggestion — the person picks.
 * @param {ReceiptExtraction | null | undefined} x
 * @returns {{ category: string, confidence: number, source: "provider" | "merchant" | "default" }}
 */
export function suggestExpenseCategory(x) {
  if (x?.suggestedCategory && CATEGORY_VALUES.has(x.suggestedCategory)) {
    return { category: x.suggestedCategory, confidence: x.confidence?.category ?? 0.7, source: "provider" };
  }
  const haystack = [x?.merchantName, x?.supplierName, ...(x?.lineItems || []).slice(0, 10).map((l) => l.description)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack) {
    for (const [re, value] of MERCHANT_HINTS) {
      if (/** @type {RegExp} */ (re).test(haystack)) {
        return { category: /** @type {string} */ (value), confidence: 0.6, source: "merchant" };
      }
    }
  }
  return { category: "other", confidence: 0.2, source: "default" };
}

// ── Supplier matching ───────────────────────────────────────────────────────────────────────

const LEGAL_SUFFIX = /\b(\(?pty\)?|proprietary|ltd|limited|cc|inc|incorporated|llc|plc|co|company|group|holdings|sa|rsa|za|t\/a)\b/g;

/** "Woolworths (Pty) Ltd." → "woolworths" @param {unknown} name */
export function normalizeSupplierName(name) {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(pty\)/g, " pty ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {unknown} value */
function normalizeTaxNumber(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

/** @param {string} a @param {string} b */
function tokenSimilarity(a, b) {
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * Match the receipt's merchant against the company's own suppliers (the caller passes only those).
 * @template {{ id: string, name?: string | null, tax_number?: string | null }} S
 * @param {{ name?: string, vatNumber?: string }} receipt
 * @param {S[]} suppliers
 * @returns {{ kind: "exact" | "close" | "none", supplier: S | null }}
 */
export function matchSupplier(receipt, suppliers) {
  const list = Array.isArray(suppliers) ? suppliers : [];
  const vat = normalizeTaxNumber(receipt?.vatNumber);
  if (vat.length >= 6) {
    const byTax = list.find((s) => normalizeTaxNumber(s.tax_number) === vat);
    if (byTax) return { kind: "exact", supplier: byTax };
  }
  const target = normalizeSupplierName(receipt?.name);
  if (!target) return { kind: "none", supplier: null };
  const exact = list.filter((s) => normalizeSupplierName(s.name) === target);
  if (exact.length === 1) return { kind: "exact", supplier: exact[0] };
  if (exact.length > 1) return { kind: "close", supplier: exact[0] };

  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const s of list) {
    const n = normalizeSupplierName(s.name);
    if (!n) continue;
    let score = tokenSimilarity(target, n);
    if (score < 1 && (n.startsWith(`${target} `) || target.startsWith(`${n} `))) score = Math.max(score, 0.9);
    if (score > bestScore) {
      best = s;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  if (best && bestScore >= 0.75 && !tie) return { kind: "close", supplier: best };
  return { kind: "none", supplier: null };
}

// ── Duplicate detection ─────────────────────────────────────────────────────────────────────

/** @param {unknown} value */
function normalizeReference(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/**
 * Possible duplicates among existing expenses (already scoped to the caller's company/visibility).
 * A warning, never a block: two coffees at the same shop on different days are not duplicates.
 *
 * @template {{ id: string, vendor?: string | null, supplier_id?: string | null, amount?: number | string | null, date?: string | null, receipt_number?: string | null, receipt_sha256?: string | null }} E
 * @param {{ sha256?: string | null, receiptNumber?: string | null, vendor?: string | null, supplierId?: string | null, total?: number | null, date?: string | null }} candidate
 * @param {E[]} expenses
 * @returns {Array<{ expense: E, reason: "same_file" | "same_receipt_number" | "same_details", strength: "exact" | "likely" }>}
 */
export function findDuplicateCandidates(candidate, expenses) {
  const list = Array.isArray(expenses) ? expenses : [];
  const hash = typeof candidate.sha256 === "string" ? candidate.sha256.toLowerCase() : "";
  const ref = normalizeReference(candidate.receiptNumber);
  const vendor = normalizeSupplierName(candidate.vendor);
  const total = candidate.total != null ? roundMoney(Number(candidate.total)) : null;
  const date = candidate.date || null;

  /** @type {Array<{ expense: E, reason: "same_file" | "same_receipt_number" | "same_details", strength: "exact" | "likely" }>} */
  const out = [];
  for (const e of list) {
    if (!e?.id) continue;
    const amount = e.amount != null && e.amount !== "" ? roundMoney(Number(e.amount)) : null;
    const sameAmount = total != null && amount != null && Math.abs(total - amount) < 0.01;
    const sameVendor =
      (candidate.supplierId && e.supplier_id && candidate.supplierId === e.supplier_id) ||
      (vendor && vendor === normalizeSupplierName(e.vendor));
    if (hash && typeof e.receipt_sha256 === "string" && e.receipt_sha256.toLowerCase() === hash) {
      out.push({ expense: e, reason: "same_file", strength: "exact" });
    } else if (ref && ref.length >= 3 && normalizeReference(e.receipt_number) === ref && (sameVendor || sameAmount)) {
      out.push({ expense: e, reason: "same_receipt_number", strength: "exact" });
    } else if (sameVendor && sameAmount && date && String(e.date || "").slice(0, 10) === date) {
      out.push({ expense: e, reason: "same_details", strength: "likely" });
    }
  }
  const rank = { same_file: 0, same_receipt_number: 1, same_details: 2 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]).slice(0, 5);
}

// ── Storage paths ───────────────────────────────────────────────────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECEIPT_PATH_RE = new RegExp(`^(${UUID})/receipts/(${UUID})/(${UUID})\\.(jpg|png|webp|pdf)$`, "i");

/** @param {string} mime */
export function receiptExtensionForMime(mime) {
  return RECEIPT_MIME_TYPES[/** @type {keyof typeof RECEIPT_MIME_TYPES} */ (String(mime || "").toLowerCase())] || null;
}

/**
 * {orgId}/receipts/{uploaderId}/{fileId}.{ext} — org first so storage RLS can key on the folder, the
 * uploader next so an employee's receipts stay theirs. The id is random: no user text in the path.
 * @param {{ orgId: string, userId: string, fileId: string, extension: string }} p
 */
export function buildReceiptStoragePath({ orgId, userId, fileId, extension }) {
  const path = `${orgId}/receipts/${userId}/${fileId}.${String(extension).toLowerCase()}`;
  if (!RECEIPT_PATH_RE.test(path)) throw new Error("Invalid receipt storage path");
  return path.toLowerCase();
}

/**
 * @param {unknown} path
 * @returns {{ orgId: string, userId: string, fileId: string, extension: string } | null}
 */
export function parseReceiptStoragePath(path) {
  if (typeof path !== "string" || path.length > 200) return null;
  const m = RECEIPT_PATH_RE.exec(path);
  if (!m) return null;
  return { orgId: m[1].toLowerCase(), userId: m[2].toLowerCase(), fileId: m[3].toLowerCase(), extension: m[4].toLowerCase() };
}

/**
 * Object path inside the receipts bucket from a stored receipt_url (legacy public-style URLs such as
 * https://x.supabase.co/storage/v1/object/public/receipts/{org}/receipt-1.jpg), or null.
 * @param {unknown} url
 */
export function receiptObjectPathFromUrl(url) {
  if (typeof url !== "string") return null;
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/([^?#]+)/.exec(url);
  if (!m) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  if (decoded.includes("..") || decoded.startsWith("/")) return null;
  return decoded;
}

// ── Final submission validation (server authority; browser mirrors it) ───────────────────────

/**
 * @typedef {{
 *   vendor?: unknown, supplier_id?: unknown, receipt_number?: unknown, date?: unknown, category?: unknown,
 *   subtotal?: unknown, vat?: unknown, vat_rate?: unknown, total?: unknown, payment_method?: unknown,
 *   description?: unknown, notes?: unknown, is_claimable?: unknown, line_items?: unknown,
 *   vat_acknowledged?: unknown,
 * }} ReceiptSubmissionInput
 */

/**
 * @param {ReceiptSubmissionInput} input
 * @param {{ today?: string }} [opts]
 * @returns {{ ok: true, value: {
 *     vendor: string | null, supplier_id: string | null, receipt_number: string | null, date: string,
 *     category: string, subtotal: number | null, vat: number | null, vat_rate: number | null, amount: number,
 *     payment_method: string | null, description: string, notes: string | null, is_claimable: boolean,
 *     line_items: Array<{ description: string, quantity?: number, unitPrice?: number, amount?: number }> | null,
 *     vat_status: string,
 *   } } | { ok: false, errors: Record<string, string>, code: string }}
 */
export function validateReceiptExpenseSubmission(input, opts = {}) {
  const today = opts.today || todayIso();
  /** @type {Record<string, string>} */
  const errors = {};
  const src = input && typeof input === "object" ? input : {};

  const vendor = cleanText(src.vendor, 120) ?? null;
  const supplierIdRaw = typeof src.supplier_id === "string" ? src.supplier_id.trim().toLowerCase() : "";
  const supplier_id = supplierIdRaw && new RegExp(`^${UUID}$`, "i").test(supplierIdRaw) ? supplierIdRaw : null;
  if (supplierIdRaw && !supplier_id) errors.supplier_id = "Choose a supplier from the list.";

  const receipt_number = cleanText(src.receipt_number, 60) ?? null;

  const date = typeof src.date === "string" ? parseReceiptDate(src.date) : null;
  if (!date) errors.date = "Enter the receipt date.";
  else if (date < MIN_DATE) errors.date = "That date is too far in the past.";
  else if (date > addDaysIso(today, 1)) errors.date = "The receipt date can't be in the future.";

  const category = typeof src.category === "string" && CATEGORY_VALUES.has(src.category) ? src.category : null;
  if (!category) errors.category = "Choose a category.";

  const total = isBlank(src.total) ? null : parseMoney(/** @type {any} */ (src.total));
  if (total == null) errors.total = "Enter the total amount.";
  else if (total <= 0) errors.total = "The total must be more than zero.";
  else if (total > MAX_AMOUNT) errors.total = "That total is too large.";

  const subtotal = isBlank(src.subtotal) ? null : parseMoney(/** @type {any} */ (src.subtotal));
  if (!isBlank(src.subtotal) && (subtotal == null || subtotal < 0)) errors.subtotal = "Enter a valid subtotal.";
  const vat = isBlank(src.vat) ? null : parseMoney(/** @type {any} */ (src.vat));
  if (!isBlank(src.vat) && (vat == null || vat < 0)) errors.vat = "Enter a valid VAT amount.";
  let vat_rate = isBlank(src.vat_rate) ? null : parseMoney(String(src.vat_rate).replace("%", ""));
  if (vat_rate != null && (vat_rate < 0 || vat_rate > 100)) vat_rate = null;

  const pm = typeof src.payment_method === "string" ? src.payment_method.trim() : "";
  const payment_method = pm ? (PAYMENT_METHOD_VALUES.has(pm) ? pm : null) : null;
  if (pm && !payment_method) errors.payment_method = "Choose a payment method.";

  const notes = cleanText(src.notes, 2000) ?? null;
  const description = cleanText(src.description, 200) || (vendor ? `Receipt from ${vendor}` : "Receipt");

  let line_items = null;
  if (Array.isArray(src.line_items) && src.line_items.length) {
    const normalized = normalizeReceiptExtraction({ lineItems: src.line_items });
    line_items = normalized.ok && normalized.extraction.lineItems ? normalized.extraction.lineItems : null;
  }

  let vat_status = "vat_missing";
  if (!errors.total && !errors.subtotal && !errors.vat && total != null) {
    const check = validateReceiptAmounts({ subtotal, vatAmount: vat, total, vatRate: vat_rate });
    vat_status = check.status;
    if (check.status === "invalid") {
      if (check.issues.includes("vat_exceeds_total")) errors.vat = "VAT can't be more than the total.";
      else if (check.issues.includes("subtotal_exceeds_total")) errors.subtotal = "The subtotal can't be more than the total.";
      else errors.total = "Check the amounts.";
    }
    if (check.status === "mismatch" && src.vat_acknowledged !== true && !Object.keys(errors).length) {
      return {
        ok: false,
        code: "VAT_REVIEW_REQUIRED",
        errors: { vat: "Subtotal, VAT and total don't add up. Correct them or confirm you've checked them." },
      };
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors, code: "VALIDATION_FAILED" };

  return {
    ok: true,
    value: {
      vendor,
      supplier_id,
      receipt_number,
      date: /** @type {string} */ (date),
      category: /** @type {string} */ (category),
      subtotal,
      vat,
      vat_rate,
      amount: /** @type {number} */ (total),
      payment_method,
      description,
      notes,
      is_claimable: src.is_claimable === true,
      line_items,
      vat_status,
    },
  };
}
