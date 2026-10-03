import { suggestExpenseCategory } from "@shared/expenses/receiptScan.js";

/** Select value for "nothing chosen" (Radix Select can't use ""). */
export const NONE = "__none";

/** Initial form values from what the receipt showed — blanks stay blank. */
export function initialReceiptFields(extraction, supplierMatch) {
  const x = extraction || {};
  const suggestion = suggestExpenseCategory(x);
  const vendor = x.merchantName || x.supplierName || "";
  return {
    vendor,
    supplier_id: supplierMatch?.supplier?.id || NONE,
    receipt_number: x.receiptNumber || x.invoiceNumber || "",
    date: x.transactionDate || "",
    category: extraction ? suggestion.category : "other",
    subtotal: x.subtotal != null ? x.subtotal.toFixed(2) : "",
    vat: x.vatAmount != null ? x.vatAmount.toFixed(2) : "",
    vat_rate: x.vatRate != null ? String(x.vatRate) : "",
    total: x.total != null ? x.total.toFixed(2) : "",
    payment_method: x.paymentMethod || NONE,
    description: "",
    notes: "",
    is_claimable: false,
  };
}

const FIELD_LABEL = { total: "total", date: "date", merchant: "supplier" };

/**
 * Headline for the review screen from what was actually read (no fake "scanned successfully").
 * @param {"server" | "on_device" | "manual"} source
 * @param {{ level: "complete" | "partial" | "none", missing: string[] }} completeness
 * @returns {{ level: string, tone: "info" | "warning", title: string, detail: string }}
 */
export function readSummary(source, completeness) {
  const save = "Nothing is saved until you tap Save expense.";
  if (source === "manual" || completeness.level === "none") {
    return {
      level: "none",
      tone: source === "manual" ? "info" : "warning",
      title: source === "manual" ? "Receipt attached." : "Receipt attached — we couldn't read the amounts.",
      detail: `Enter the details from the receipt. ${save}`,
    };
  }
  const where = source === "on_device" ? " Read on this device, so double-check every amount." : "";
  if (completeness.level === "partial") {
    const missing = completeness.missing.map((f) => FIELD_LABEL[f] || f).join(", ");
    return {
      level: "partial",
      tone: "warning",
      title: "We could only read part of this receipt.",
      detail: `Fill in the ${missing} and check the highlighted fields.${where} ${save}`,
    };
  }
  return {
    level: "complete",
    tone: "info",
    title: "Receipt read.",
    detail: `Check the highlighted fields against the receipt.${where} ${save}`,
  };
}
