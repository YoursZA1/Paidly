import {
  handleCustomerPaymentWebhook,
  handlePaymentIntentCreate,
  handlePaymentIntentGet,
  handlePaymentProvidersList,
} from "./paymentIntentRoutes.js";

export function registerPaymentIntentRoutes(app) {
  app.get("/api/payment-intents/providers", handlePaymentProvidersList);
  app.get("/api/payment-intents", handlePaymentProvidersList);
  app.post("/api/payment-intents", handlePaymentIntentCreate);
  app.get("/api/payment-intents/:id", handlePaymentIntentGet);
  app.post("/api/payments/webhook/:provider", handleCustomerPaymentWebhook);
}
