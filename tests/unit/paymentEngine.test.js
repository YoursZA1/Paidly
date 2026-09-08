import { describe, expect, it } from "vitest";
import {
  PAYMENT_ENGINE_RULES,
  PAYMENT_ENGINE_SOURCES,
  PAYMENT_SETTLEMENT_ADAPTERS,
  assertPaymentEngineSource,
  isCustomerPaymentEngineSource,
  settlementAdapterForSource,
} from "../../shared/payments/paymentEngine.js";
import { assertCustomerPaymentProvider } from "../../server/src/payments/paymentIntentContract.js";

describe("Payment Engine contract", () => {
  it("accepts document and pos sources and rejects unknown kinds", () => {
    expect(assertPaymentEngineSource("document")).toBe(PAYMENT_ENGINE_SOURCES.DOCUMENT);
    expect(assertPaymentEngineSource("POS")).toBe(PAYMENT_ENGINE_SOURCES.POS);
    expect(isCustomerPaymentEngineSource("saas")).toBe(false);
    expect(() => assertPaymentEngineSource("payroll")).toThrow(/second payment system/);
    expect(() => assertPaymentEngineSource("saas")).toThrow(/UNKNOWN_PAYMENT_ENGINE_SOURCE|second payment system/);
  });

  it("maps customer sources to existing settlement adapters and keeps SaaS off intents", () => {
    expect(settlementAdapterForSource("document")).toBe("invoice_payments");
    expect(settlementAdapterForSource("pos")).toBe("pos_sales_events");
    expect(PAYMENT_SETTLEMENT_ADAPTERS.saas).toBe("payment_history");
    expect(PAYMENT_ENGINE_RULES.saasNeverOnCustomerIntents).toBe(true);
    expect(PAYMENT_ENGINE_RULES.successUrlIsNotSettlement).toBe(true);
  });

  it("keeps PayFast off customer payment_intents", () => {
    expect(() => assertCustomerPaymentProvider("payfast", "document")).toThrow(/platform subscriptions/);
    expect(() => assertCustomerPaymentProvider("payfast", "pos")).toThrow(/platform subscriptions/);
  });
});
