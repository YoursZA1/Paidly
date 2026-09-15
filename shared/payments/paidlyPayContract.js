/**
 * Paidly Pay API contract.
 * Maps the terminal-facing vocabulary onto existing payment_intents statuses.
 * Amounts stay in Paidly rands (numeric(14,2)), not cents.
 */

export const PAIDLY_PAY_SERVICE = "paidly-api";
export const PAIDLY_PAY_VERSION = "1";

export const PAIDLY_PAY_SCOPES = Object.freeze([
  "transactions:read",
  "payments:create",
  "payments:read",
  "payments:cancel",
  "payments:refund",
  "devices:manage",
]);

export const PAIDLY_PAY_METHODS = Object.freeze([
  "tap_to_pay",
  "qr",
  "card",
  "cash",
  "eft",
  "payment_link",
]);

export const PAIDLY_PAY_PUBLIC_STATUSES = Object.freeze([
  "created",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
]);

export const PAIDLY_PAY_WEBHOOK_EVENTS = Object.freeze([
  "payment.created",
  "payment.pending",
  "payment.processing",
  "payment.succeeded",
  "payment.failed",
  "payment.cancelled",
  "payment.expired",
  "payment.refunded",
  "payment.partially_refunded",
  "pos.sale.created",
]);

export const PAIDLY_PAY_ERROR = Object.freeze({
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  MISSING_SIGNATURE: "MISSING_SIGNATURE",
  MALFORMED_BODY: "MALFORMED_BODY",
  UNKNOWN_EVENT: "UNKNOWN_EVENT",
  RATE_LIMITED: "RATE_LIMITED",
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
  PAYMENT_TRANSACTION_ALREADY_PAID: "PAYMENT_TRANSACTION_ALREADY_PAID",
  PAYMENT_NOT_PAYABLE: "PAYMENT_NOT_PAYABLE",
  PAYMENT_INTENT_NOT_FOUND: "PAYMENT_INTENT_NOT_FOUND",
  PAYMENT_NOT_CANCELLABLE: "PAYMENT_NOT_CANCELLABLE",
  PAYMENT_NOT_REFUNDABLE: "PAYMENT_NOT_REFUNDABLE",
  REFUND_AMOUNT_INVALID: "REFUND_AMOUNT_INVALID",
  CROSS_COMPANY_DENIED: "CROSS_COMPANY_DENIED",
  DEVICE_REVOKED: "DEVICE_REVOKED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  AMOUNT_OVERRIDE_FORBIDDEN: "AMOUNT_OVERRIDE_FORBIDDEN",
  INVALID_PAYMENT_METHOD: "INVALID_PAYMENT_METHOD",
});

const INTENT_TO_PUBLIC = Object.freeze({
  pending: "created",
  requires_action: "pending",
  processing: "processing",
  paid: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
  refunded: "refunded",
});

const WEBHOOK_TO_INTENT = Object.freeze({
  "payment.created": "pending",
  "payment.pending": "requires_action",
  "payment.processing": "processing",
  "payment.succeeded": "paid",
  "payment.failed": "failed",
  "payment.cancelled": "cancelled",
  "payment.expired": "expired",
  "payment.refunded": "refunded",
});

const METHOD_TO_PROVIDER = Object.freeze({
  tap_to_pay: "card_terminal",
  qr: "card_terminal",
  card: "card_terminal",
  cash: "cash",
  eft: "ozow",
  payment_link: "ozow",
});

const METHOD_TO_TILL = Object.freeze({
  tap_to_pay: "card",
  qr: "card",
  card: "card",
  cash: "cash",
  eft: "digital",
  payment_link: "digital",
});

export function normalizePaidlyPayMethod(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return PAIDLY_PAY_METHODS.includes(key) ? key : null;
}

export function providerForPaidlyPayMethod(method) {
  const key = normalizePaidlyPayMethod(method);
  return key ? METHOD_TO_PROVIDER[key] : null;
}

export function tillMethodForPaidlyPayMethod(method) {
  const key = normalizePaidlyPayMethod(method);
  return key ? METHOD_TO_TILL[key] : null;
}

export function publicStatusFromIntent(intent, sale = null) {
  const status = String(intent?.status || "").trim().toLowerCase();
  if (status === "paid" && String(sale?.refund_status || "") === "partial") {
    return "partially_refunded";
  }
  return INTENT_TO_PUBLIC[status] || null;
}

export function intentStatusFromWebhookEvent(eventType) {
  const key = String(eventType || "").trim().toLowerCase();
  return WEBHOOK_TO_INTENT[key] || null;
}

export function isKnownPaidlyPayWebhookEvent(eventType) {
  const key = String(eventType || "").trim().toLowerCase();
  return PAIDLY_PAY_WEBHOOK_EVENTS.includes(key);
}

export function isOpenIntentStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  return key === "pending" || key === "requires_action" || key === "processing";
}

export function paymentReferenceForIntent(intent) {
  const metadata = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  if (metadata.payment_reference) return String(metadata.payment_reference);
  const day = String(intent?.created_at || "").slice(0, 10).replace(/-/g, "") || "00000000";
  const suffix = String(intent?.id || "").replace(/-/g, "").slice(-6).toUpperCase() || "000000";
  return `PAY-${day}-${suffix}`;
}

export function transactionReferenceForIntent(intent) {
  const metadata = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  const checkout = metadata.checkout && typeof metadata.checkout === "object" ? metadata.checkout : {};
  if (checkout.receipt_number) return String(checkout.receipt_number);
  if (metadata.transaction_reference) return String(metadata.transaction_reference);
  const suffix = String(intent?.id || "").replace(/-/g, "").slice(-6).toUpperCase() || "000000";
  return `POS-${suffix}`;
}

export function isMockPaymentsEnabled(env = process.env) {
  const mode = String(env.PAYMENT_PROVIDER_MODE || "").trim().toLowerCase();
  if (mode !== "mock") return false;
  if (String(env.NODE_ENV || "").trim() === "production" && env.ALLOW_MOCK_PAYMENTS !== "1") {
    return false;
  }
  return true;
}

export function paidlyPayEnvironment(env = process.env) {
  if (String(env.NODE_ENV || "").trim() === "production") return "production";
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}
