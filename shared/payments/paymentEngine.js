/**
 * Paidly Payment Engine — first-class subsystem contract.
 *
 * POS, invoices, and future payable modules enter here.
 * They do not own providers, webhooks, or payment tables.
 *
 *   POS ────────┐
 *   Invoices ───┼──→ Payment Engine ──→ Ozow | cash | card_terminal
 *   Future ─────┘                    └──→ PayFast (SaaS only)
 *                    │
 *                    ↓
 *           Settlement adapters
 *           (payments | pos_sales_events | payment_history)
 */

export const PAYMENT_ENGINE = "payment_engine";

/** Modules that may create customer payment_intents. New kinds need a migration + adapter. */
export const PAYMENT_ENGINE_SOURCES = Object.freeze({
  DOCUMENT: "document",
  POS: "pos",
});

export const PAYMENT_ENGINE_SOURCE_LIST = Object.freeze(Object.values(PAYMENT_ENGINE_SOURCES));

/**
 * Where verified money lands. Do not merge these into one table.
 * SaaS is not a customer source_kind — it never writes payment_intents.
 */
export const PAYMENT_SETTLEMENT_ADAPTERS = Object.freeze({
  [PAYMENT_ENGINE_SOURCES.DOCUMENT]: "invoice_payments",
  [PAYMENT_ENGINE_SOURCES.POS]: "pos_sales_events",
  saas: "payment_history",
});

export const PAYMENT_ENGINE_RULES = Object.freeze({
  oneEngine: true,
  customerTable: "payment_intents",
  saasProvider: "payfast",
  saasNeverOnCustomerIntents: true,
  verifiedWebhookOnly: true,
  successUrlIsNotSettlement: true,
  noModulePaymentTables: true,
  noModuleProviderIntegrations: true,
});

export function normalizePaymentEngineSource(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === PAYMENT_ENGINE_SOURCES.DOCUMENT || key === PAYMENT_ENGINE_SOURCES.POS) return key;
  return null;
}

export function assertPaymentEngineSource(raw) {
  const source = normalizePaymentEngineSource(raw);
  if (source) return source;
  const error = new Error(
    "Unknown Payment Engine source. Add a payment_intents.source_kind + settlement adapter — do not create a second payment system."
  );
  error.code = "UNKNOWN_PAYMENT_ENGINE_SOURCE";
  throw error;
}

export function settlementAdapterForSource(sourceKind) {
  const source = assertPaymentEngineSource(sourceKind);
  return PAYMENT_SETTLEMENT_ADAPTERS[source];
}

export function isCustomerPaymentEngineSource(sourceKind) {
  return Boolean(normalizePaymentEngineSource(sourceKind));
}
