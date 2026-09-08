import {
  handleCustomerPaymentWebhook,
  handlePaymentIntentCreate,
  handlePaymentIntentGet,
  handlePaymentProvidersList,
} from "./paymentIntentRoutes.js";
import {
  handleDocumentHistory,
  handleDocumentPay,
  handleDocumentRemind,
  handleOzowReturn,
} from "./documentPaymentRoutes.js";
import {
  handleDocumentEngagement,
  handleDocumentEventIngest,
  handleDocumentTimeline,
} from "../documents/documentEventRoutes.js";

export function registerPaymentIntentRoutes(app) {
  app.get("/api/payment-intents/providers", handlePaymentProvidersList);
  app.get("/api/payment-intents", handlePaymentProvidersList);
  app.post("/api/payment-intents", handlePaymentIntentCreate);
  app.post("/api/payment-intents/document-pay", handleDocumentPay);
  app.post("/api/payment-intents/document-remind", handleDocumentRemind);
  app.get("/api/payment-intents/document-history", handleDocumentHistory);
  app.get("/api/payment-intents/document-timeline", handleDocumentTimeline);
  app.get("/api/payment-intents/document-engagement", handleDocumentEngagement);
  app.post("/api/payment-intents/document-event", handleDocumentEventIngest);
  app.get("/api/payment-intents/ozow-return", handleOzowReturn);
  app.post("/api/payment-intents/webhook/:provider", handleCustomerPaymentWebhook);
  app.get("/api/payment-intents/:id", handlePaymentIntentGet);
  app.post("/api/payments/webhook/:provider", handleCustomerPaymentWebhook);
}
