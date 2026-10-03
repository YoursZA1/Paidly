/**
 * How an invoice payment was received.
 * Cash, EFT, card, POS and other are recorded against the invoice with no payment provider.
 * Digital is the only method that starts an online charge through the Payment Engine.
 */

export const INVOICE_PAYMENT_METHOD = Object.freeze({
  CASH: "cash",
  EFT: "eft",
  CARD: "card",
  POS: "pos",
  DIGITAL: "digital",
  OTHER: "other",
});

/** Choices on Record Payment. `online` is Pay online, not a recorded receipt. */
export const INVOICE_PAYMENT_CHOICES = Object.freeze([
  { value: INVOICE_PAYMENT_METHOD.CASH, label: "Cash" },
  { value: INVOICE_PAYMENT_METHOD.EFT, label: "EFT / Bank Transfer" },
  { value: INVOICE_PAYMENT_METHOD.CARD, label: "Card" },
  { value: INVOICE_PAYMENT_METHOD.POS, label: "POS" },
  { value: INVOICE_PAYMENT_METHOD.DIGITAL, label: "Digital Payment", online: true },
  { value: INVOICE_PAYMENT_METHOD.OTHER, label: "Other" },
]);

/** Methods stored on an approved offline receipt (payments.method). Legacy values stay valid. */
export const INVOICE_OFFLINE_METHODS = Object.freeze([
  "cash",
  "eft",
  "card",
  "pos",
  "other",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "mobile_payment",
  "check",
]);

const OFFLINE = new Set(INVOICE_OFFLINE_METHODS);

const LABEL = Object.freeze({
  cash: "Cash",
  eft: "EFT / Bank Transfer",
  bank_transfer: "EFT / Bank Transfer",
  card: "Card",
  credit_card: "Card",
  debit_card: "Card",
  pos: "POS",
  digital: "Digital Payment",
  other: "Other",
  mobile_payment: "Mobile payment",
  check: "Cheque",
});

export function isOnlineInvoicePaymentMethod(method) {
  return String(method || "").trim().toLowerCase() === INVOICE_PAYMENT_METHOD.DIGITAL;
}

/** Canonical offline method, or null when this is not a receipt the business can record. */
export function normalizeOfflineInvoiceMethod(method) {
  const value = String(method || "").trim().toLowerCase();
  return OFFLINE.has(value) ? value : null;
}

export function invoicePaymentMethodLabel(method) {
  const value = String(method || "").trim().toLowerCase();
  return LABEL[value] || "";
}
