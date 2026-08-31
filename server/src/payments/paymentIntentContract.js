/** Canonical customer-payment contract. PayFast is SaaS billing only. */

export const PAYMENT_INTENT_SOURCE_KINDS = Object.freeze(["document", "pos"]);

export const PAYMENT_INTENT_STATUSES = Object.freeze([
  "pending",
  "requires_action",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);

/** Customer-facing rails stored on payment_intents. `cash` is till settlement, not a PSP. */
export const CUSTOMER_PAYMENT_PROVIDERS = Object.freeze({
  CASH: "cash",
  OZOW: "ozow",
  CARD_TERMINAL: "card_terminal",
});

export const ONLINE_PAYMENT_PROVIDERS = Object.freeze([CUSTOMER_PAYMENT_PROVIDERS.OZOW]);
export const TERMINAL_PAYMENT_PROVIDERS = Object.freeze([CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL]);

/** Paidly platform subscriptions only — never a POS or invoice customer rail. */
export const SAAS_BILLING_PROVIDER = "payfast";

const POS_PROVIDERS = new Set([
  CUSTOMER_PAYMENT_PROVIDERS.CASH,
  CUSTOMER_PAYMENT_PROVIDERS.OZOW,
  CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL,
]);
const DOCUMENT_PROVIDERS = new Set([CUSTOMER_PAYMENT_PROVIDERS.OZOW]);

export function normalizeCustomerPaymentProvider(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === SAAS_BILLING_PROVIDER) return null;
  if (key === CUSTOMER_PAYMENT_PROVIDERS.CASH || key === CUSTOMER_PAYMENT_PROVIDERS.OZOW || key === CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL) return key;
  return null;
}

export function assertCustomerPaymentProvider(provider, sourceKind) {
  const id = String(provider || "").trim().toLowerCase();
  const source = String(sourceKind || "").trim().toLowerCase();
  if (id === SAAS_BILLING_PROVIDER) {
    const error = new Error("PayFast is only for Paidly platform subscriptions, not customer payments");
    error.code = "PAYFAST_NOT_CUSTOMER_RAIL";
    throw error;
  }
  if (source === "pos" && !POS_PROVIDERS.has(id)) {
    const error = new Error("POS payment must be cash, ozow, or card_terminal");
    error.code = "UNSUPPORTED_POS_PROVIDER";
    throw error;
  }
  if (source === "document" && !DOCUMENT_PROVIDERS.has(id)) {
    const error = new Error("Document payment provider must be ozow");
    error.code = "UNSUPPORTED_DOCUMENT_PROVIDER";
    throw error;
  }
  return id;
}

export function isOnlinePaymentProvider(provider) {
  return ONLINE_PAYMENT_PROVIDERS.includes(String(provider || "").trim().toLowerCase());
}

export function isTillCashSettlement(provider) {
  return String(provider || "").trim().toLowerCase() === CUSTOMER_PAYMENT_PROVIDERS.CASH;
}

export function isCardTerminalSettlement(provider) {
  return TERMINAL_PAYMENT_PROVIDERS.includes(String(provider || "").trim().toLowerCase());
}

/**
 * Till tender method → payment_intents.provider.
 * cash → till cash; digital → Ozow; card → card_terminal (not click-to-paid).
 */
export function mapPosPaymentMethodToProvider(paymentMethod) {
  const method = String(paymentMethod || "").trim().toLowerCase();
  if (method === "digital") return CUSTOMER_PAYMENT_PROVIDERS.OZOW;
  if (method === "card") return CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL;
  if (method === "cash" || method === "other") return CUSTOMER_PAYMENT_PROVIDERS.CASH;
  return null;
}

export function publicPaymentIntentView(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    source_kind: row.source_kind,
    provider: row.provider,
    amount: Number(row.amount) || 0,
    currency: row.currency || "ZAR",
    status: row.status,
    external_id: row.external_id || null,
    pos_sale_event_id: row.pos_sale_event_id || null,
    document_id: row.document_id || null,
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    settlement:
      metadata.settlement ||
      (row.provider === "cash" ? "till" : row.provider === "card_terminal" ? "terminal" : "online"),
    amount_tendered: metadata.amount_tendered != null ? Number(metadata.amount_tendered) : null,
    change_due: metadata.change_due != null ? Number(metadata.change_due) : null,
    code: metadata.code || null,
    next_action: metadata.next_action || null,
  };
}
