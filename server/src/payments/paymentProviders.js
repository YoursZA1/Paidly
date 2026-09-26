import { CUSTOMER_PAYMENT_PROVIDERS, SAAS_BILLING_PROVIDER } from "./paymentIntentContract.js";
import { ozowProvider } from "./providers/ozowProvider.js";
import { cardTerminalProvider } from "./providers/cardTerminalProvider.js";
import {
  ONLINE_TENDER,
  PAYMENT_PROVIDER_CATALOG,
  PAYMENT_PROVIDER_KIND,
} from "../../../shared/payments/paymentProviderCatalog.js";

/**
 * Provider adapter registry — the only place the Payment Engine learns which rails exist.
 *
 * Adapter contract:
 *   id            payment_intents.provider value (must exist in PAYMENT_PROVIDER_CATALOG)
 *   kind          "online" | "terminal"
 *   sourceKinds   Payment Engine sources it can serve ("pos", "document")
 *   currencies    optional ISO codes it accepts (omit = any)
 *   isConfigured()                  true when its server-side credentials are present
 *   createCharge(intent, ctx)       never returns paid for online rails; returns next_action
 *   handleWebhook(body, req)        verify only → { ok, provider, intentId, nextStatus, externalId, amount, providerStatus }
 *
 * Cash is till settlement and is not registered here.
 */
const registry = new Map([
  [ozowProvider.id, ozowProvider],
  [cardTerminalProvider.id, cardTerminalProvider],
]);

function providerKind(provider) {
  return provider.kind || PAYMENT_PROVIDER_CATALOG[provider.id]?.kind || PAYMENT_PROVIDER_KIND.ONLINE;
}

function providerError(message, code, status = 422) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/** Public, secret-free view of registered providers. */
export function listCustomerPaymentProviders({ sourceKind = null } = {}) {
  return [...registry.values()]
    .filter((provider) => !sourceKind || provider.sourceKinds.includes(sourceKind))
    .map((provider) => ({
      id: provider.id,
      label: PAYMENT_PROVIDER_CATALOG[provider.id]?.label || provider.id,
      sourceKinds: provider.sourceKinds,
      currencies: provider.currencies || null,
      configured: Boolean(provider.isConfigured()),
      kind: providerKind(provider),
    }));
}

export function getCustomerPaymentProvider(providerId) {
  const id = String(providerId || "").trim().toLowerCase();
  if (id === SAAS_BILLING_PROVIDER) {
    throw providerError("PayFast is only for Paidly platform subscriptions, not customer payments", "PAYFAST_NOT_CUSTOMER_RAIL", 400);
  }
  if (id === CUSTOMER_PAYMENT_PROVIDERS.CASH) {
    throw providerError("Cash is settled on the till, not through an online payment provider", "CASH_NOT_ONLINE_PROVIDER", 400);
  }
  const provider = registry.get(id);
  if (!provider) {
    throw providerError(`Unknown customer payment provider: ${id || "(empty)"}`, "UNKNOWN_PAYMENT_PROVIDER", 404);
  }
  return provider;
}

/** Registered online-provider ids that can serve a source (configured or not). */
export function onlineProviderIdsForSource(sourceKind) {
  return [...registry.values()]
    .filter((provider) => providerKind(provider) === PAYMENT_PROVIDER_KIND.ONLINE && provider.sourceKinds.includes(sourceKind))
    .map((provider) => provider.id);
}

/**
 * Pick the online provider that takes this payment.
 * - `requested` given: it must be a registered online provider for the source, configured, and
 *   accept the currency. A browser can never select a provider that is not registered here.
 * - otherwise: the first configured online provider for the source.
 * @returns the adapter, or throws PROVIDER_NOT_CONFIGURED / UNSUPPORTED_PAYMENT_PROVIDER / UNSUPPORTED_CURRENCY.
 */
export function resolveOnlineProvider({ sourceKind, requested = null, currency = null } = {}) {
  const wanted = String(requested || "").trim().toLowerCase();
  const code = currency ? String(currency).trim().toUpperCase() : null;
  const candidates = [...registry.values()].filter(
    (provider) => providerKind(provider) === PAYMENT_PROVIDER_KIND.ONLINE && provider.sourceKinds.includes(sourceKind)
  );

  if (wanted) {
    const provider = candidates.find((p) => p.id === wanted);
    if (!provider) {
      throw providerError(`${wanted} is not a supported online payment provider here`, "UNSUPPORTED_PAYMENT_PROVIDER");
    }
    if (!provider.isConfigured()) {
      throw providerError(
        `${PAYMENT_PROVIDER_CATALOG[provider.id]?.label || provider.id} is not configured. The sale was not started.`,
        "PROVIDER_NOT_CONFIGURED"
      );
    }
    if (code && provider.currencies && !provider.currencies.includes(code)) {
      throw providerError(`${PAYMENT_PROVIDER_CATALOG[provider.id]?.label || provider.id} does not accept ${code}`, "UNSUPPORTED_CURRENCY");
    }
    return provider;
  }

  const configured = candidates.filter((p) => p.isConfigured());
  if (!configured.length) {
    throw providerError(
      "No digital payment provider is connected. Take cash, or connect a payment provider first.",
      "PROVIDER_NOT_CONFIGURED"
    );
  }
  const provider = configured.find((p) => !code || !p.currencies || p.currencies.includes(code));
  if (!provider) {
    throw providerError(`No connected payment provider accepts ${code}`, "UNSUPPORTED_CURRENCY");
  }
  return provider;
}

/** Public summary of the online provider a source would use right now, or null. Never throws. */
export function describeOnlineProvider({ sourceKind, currency = null } = {}) {
  try {
    const provider = resolveOnlineProvider({ sourceKind, currency });
    return { id: provider.id, label: PAYMENT_PROVIDER_CATALOG[provider.id]?.label || provider.id };
  } catch {
    return null;
  }
}

/**
 * Till tender → payment_intents.provider, resolved by the engine.
 * cash/other → till cash; card → card_terminal; digital → the configured online provider.
 */
export function resolvePosTenderProvider(paymentMethod, { requestedProvider = null, currency = null } = {}) {
  const method = String(paymentMethod || "").trim().toLowerCase();
  if (method === ONLINE_TENDER) {
    return resolveOnlineProvider({ sourceKind: "pos", requested: requestedProvider, currency }).id;
  }
  if (method === "card") return CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL;
  if (method === "cash" || method === "other") return CUSTOMER_PAYMENT_PROVIDERS.CASH;
  return null;
}

export { CUSTOMER_PAYMENT_PROVIDERS };
