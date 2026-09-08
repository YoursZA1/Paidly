/**
 * Payment Engine runtime facade.
 *
 * External modules (POS checkout, invoice Pay Now, future payable docs)
 * import from this file — not from a module-local payment stack.
 *
 * Internals (providers, hash, intent rows) stay in this directory.
 */

export {
  PAYMENT_ENGINE,
  PAYMENT_ENGINE_SOURCES,
  PAYMENT_ENGINE_SOURCE_LIST,
  PAYMENT_SETTLEMENT_ADAPTERS,
  PAYMENT_ENGINE_RULES,
  assertPaymentEngineSource,
  settlementAdapterForSource,
} from "../../../shared/payments/paymentEngine.js";

export {
  PAYMENT_INTENT_SOURCE_KINDS,
  PAYMENT_INTENT_STATUSES,
  CUSTOMER_PAYMENT_PROVIDERS,
  SAAS_BILLING_PROVIDER,
  assertCustomerPaymentProvider,
  publicPaymentIntentView,
} from "./paymentIntentContract.js";

export {
  createPaymentIntentRow as createCustomerPaymentIntent,
  confirmPaymentIntent as confirmCustomerPaymentIntent,
  applyVerifiedIntentStatus,
  getOrgPaymentIntent,
  markPaymentIntentExpired,
  settleTillCashIntent,
  attachPosSaleToIntent,
  mapPaymentIntentSchemaError,
  publicPaymentIntentView as toPublicPaymentIntent,
} from "./paymentIntentService.js";

export { applyVerifiedProviderEvent, settleDocumentIntent } from "./documentPaymentService.js";

export { getCustomerPaymentProvider, listCustomerPaymentProviders } from "./paymentProviders.js";
