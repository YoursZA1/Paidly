/**
 * What the receipt OCR/scanner should automatically detect.
 * Use this spec when calling ExtractDataFromUploadedFile so the OCR returns these fields.
 *
 * Field      | Example        | Notes
 * -----------|----------------|------------------------------------------
 * Vendor     | Pick n Pay     | Merchant/store name
 * Date       | 2026-03-14     | ISO date (yyyy-MM-dd)
 * Total      | R245.80        | Total amount (number, no currency symbol)
 * VAT        | R32.06         | VAT/tax amount if shown on receipt
 * Currency   | ZAR            | ISO 4217 code
 * Category   | Office Supplies| Map to app category (office, travel, etc.)
 */

export const RECEIPT_OCR_FIELDS = {
  VENDOR: "vendor_name",
  DATE: "date",
  TOTAL: "total",
  VAT: "vat",
  CURRENCY: "currency",
  CATEGORY: "category",
};

/** JSON schema for ExtractDataFromUploadedFile: request these fields from OCR */
export const RECEIPT_OCR_JSON_SCHEMA = {
  type: "object",
  properties: {
    [RECEIPT_OCR_FIELDS.VENDOR]: { type: "string", description: "Vendor or merchant name, e.g. Pick n Pay" },
    [RECEIPT_OCR_FIELDS.DATE]: { type: "string", format: "date", description: "Transaction date, e.g. 2026-03-14" },
    [RECEIPT_OCR_FIELDS.TOTAL]: { type: "number", description: "Total amount, e.g. 245.80" },
    [RECEIPT_OCR_FIELDS.VAT]: { type: "number", description: "VAT amount if shown, e.g. 32.06" },
    [RECEIPT_OCR_FIELDS.CURRENCY]: { type: "string", description: "Currency code, e.g. ZAR" },
    [RECEIPT_OCR_FIELDS.CATEGORY]: { type: "string", description: "Expense category" },
    description: { type: "string", description: "Short description or first line item" },
  },
};

/** Category enum for OCR to choose from (matches ExpenseForm categories) */
export const RECEIPT_OCR_CATEGORIES = [
  "office",
  "travel",
  "utilities",
  "supplies",
  "salary",
  "marketing",
  "software",
  "consulting",
  "legal",
  "maintenance",
  "vehicle",
  "meals",
  "other",
];

/** Schema with category enum for OCR extraction */
export function getReceiptExtractionSchema() {
  return {
    type: "object",
    properties: {
      vendor_name: { type: "string" },
      date: { type: "string", format: "date" },
      total: { type: "number" },
      vat: { type: "number" },
      currency: { type: "string" },
      category: { type: "string", enum: RECEIPT_OCR_CATEGORIES },
      description: { type: "string" },
    },
  };
}

/**
 * Auto-fill expense form after parsing.
 * Maps detected receipt fields to the expense form shape.
 * @param {Object} parsed - OCR/API result: { vendor_name, date, total?, amount?, vat, currency, category, description }
 * @param {Object} defaults - Optional defaults for missing fields (e.g. receipt_url, attachments)
 * @returns {Object} Expense form fields: { vendor, amount, date, vat, currency, category, description, ... }
 */
export function parsedReceiptToExpenseForm(parsed, defaults = {}) {
  const detectedVendor = parsed?.vendor_name ?? "";
  const detectedTotal = parsed?.total ?? parsed?.amount;
  const detectedDate = parsed?.date ?? new Date().toISOString().slice(0, 10);
  return {
    vendor: detectedVendor,
    amount: detectedTotal ?? "",
    date: detectedDate,
    vat: parsed?.vat ?? "",
    currency: parsed?.currency ?? "ZAR",
    category: parsed?.category ?? "office",
    description: parsed?.description ?? (detectedVendor ? `Receipt from ${detectedVendor}` : "Receipt"),
    ...defaults,
  };
}
