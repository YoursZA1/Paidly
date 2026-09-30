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
