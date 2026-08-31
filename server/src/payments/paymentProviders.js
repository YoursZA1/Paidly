import { CUSTOMER_PAYMENT_PROVIDERS, SAAS_BILLING_PROVIDER } from "./paymentIntentContract.js";
import { ozowProvider } from "./providers/ozowProvider.js";
import { cardTerminalProvider } from "./providers/cardTerminalProvider.js";

/** Confirming rails (Ozow digital, card terminal). Cash is till settlement, not registered here. */
const registry = new Map([
  [ozowProvider.id, ozowProvider],
  [cardTerminalProvider.id, cardTerminalProvider],
]);

export function listCustomerPaymentProviders() {
  return [...registry.values()].map((provider) => ({
    id: provider.id,
    sourceKinds: provider.sourceKinds,
    configured: provider.isConfigured(),
    kind: provider.kind || "online",
  }));
}

export function getCustomerPaymentProvider(providerId) {
  const id = String(providerId || "").trim().toLowerCase();
  if (id === SAAS_BILLING_PROVIDER) {
    const error = new Error("PayFast is only for Paidly platform subscriptions, not customer payments");
    error.code = "PAYFAST_NOT_CUSTOMER_RAIL";
    throw error;
  }
  if (id === CUSTOMER_PAYMENT_PROVIDERS.CASH) {
    const error = new Error("Cash is settled on the till, not through an online payment provider");
    error.code = "CASH_NOT_ONLINE_PROVIDER";
    throw error;
  }
  const provider = registry.get(id);
  if (!provider) {
    const error = new Error(`Unknown customer payment provider: ${id || "(empty)"}`);
    error.code = "UNKNOWN_PAYMENT_PROVIDER";
    throw error;
  }
  return provider;
}

export { CUSTOMER_PAYMENT_PROVIDERS };
