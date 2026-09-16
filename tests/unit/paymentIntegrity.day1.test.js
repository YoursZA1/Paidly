/**
 * Day 1 payment integrity — no fake customer money.
 */
import { describe, expect, it, vi } from "vitest";
import { recordPortalPayment } from "../../api/client-portal/_shared.js";
import { processPayfastInvoiceItn } from "../../server/src/payfastInvoiceItn.js";
import payfastOnceHandler from "../../server/src/payfastOnceApi.js";
import { PAYMENT_ENGINE_RULES, settlementAdapterForSource } from "../../shared/payments/paymentEngine.js";
import { portalProcessPayment } from "../../src/api/clientPortalClient.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe("payment integrity — portal cannot create money", () => {
  it("recordPortalPayment never inserts and always fails closed", async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error("should not touch database");
      }),
    };
    const result = await recordPortalPayment(supabase, "org", "client", "inv", 100, "credit_card", "fake");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PORTAL_PAYMENT_DISABLED");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("portalProcessPayment client helper refuses before network", async () => {
    await expect(portalProcessPayment("token", { invoiceId: "x", amount: 10 })).rejects.toMatchObject({
      code: "PORTAL_PAYMENT_DISABLED",
    });
  });
});

describe("payment integrity — legacy customer PayFast disabled; SaaS rules intact", () => {
  it("processPayfastInvoiceItn throws and does not settle", async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error("should not touch database");
      }),
    };
    await expect(processPayfastInvoiceItn(supabase, { payment_status: "COMPLETE", custom_str1: "invoice:00000000-0000-4000-8000-000000000001" })).rejects.toMatchObject({
      code: "CUSTOMER_PAYFAST_DISABLED",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("POST /api/payfast/once returns 410", async () => {
    const req = { method: "POST", headers: {} };
    const res = mockRes();
    await payfastOnceHandler(req, res);
    expect(res.statusCode).toBe(410);
    expect(res.body?.code).toBe("CUSTOMER_PAYFAST_DISABLED");
  });

  it("Payment Engine keeps SaaS on payment_history and customer on payment_intents", () => {
    expect(PAYMENT_ENGINE_RULES.saasProvider).toBe("payfast");
    expect(PAYMENT_ENGINE_RULES.saasNeverOnCustomerIntents).toBe(true);
    expect(PAYMENT_ENGINE_RULES.verifiedWebhookOnly).toBe(true);
    expect(PAYMENT_ENGINE_RULES.successUrlIsNotSettlement).toBe(true);
    expect(settlementAdapterForSource("document")).toBe("invoice_payments");
    expect(settlementAdapterForSource("pos")).toBe("pos_sales_events");
  });
});
