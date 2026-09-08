import { describe, it, expect } from "vitest";
import {
  assertCustomerPaymentProvider,
  isTillCashSettlement,
  isOnlinePaymentProvider,
  isCardTerminalSettlement,
  mapPosPaymentMethodToProvider,
  normalizeCustomerPaymentProvider,
  SAAS_BILLING_PROVIDER,
} from "../../server/src/payments/paymentIntentContract.js";
import { getCustomerPaymentProvider, listCustomerPaymentProviders } from "../../server/src/payments/paymentProviders.js";
import { settleTillCash } from "../../server/src/pos/posCashSettlement.js";
import { ozowCredentialsPresent, ozowProvider } from "../../server/src/payments/providers/ozowProvider.js";
import { cardTerminalProvider } from "../../server/src/payments/providers/cardTerminalProvider.js";

describe("customer payment rails", () => {
  it("maps cash, digital, and card to distinct rails", () => {
    expect(mapPosPaymentMethodToProvider("cash")).toBe("cash");
    expect(isTillCashSettlement("cash")).toBe(true);
    expect(mapPosPaymentMethodToProvider("digital")).toBe("ozow");
    expect(isOnlinePaymentProvider("ozow")).toBe(true);
    expect(mapPosPaymentMethodToProvider("card")).toBe("card_terminal");
    expect(isCardTerminalSettlement("card_terminal")).toBe(true);
    expect(isOnlinePaymentProvider("card_terminal")).toBe(false);
    expect(normalizeCustomerPaymentProvider("payfast")).toBeNull();
    expect(SAAS_BILLING_PROVIDER).toBe("payfast");
  });

  it("rejects PayFast and does not treat cash as an online provider", () => {
    expect(() => assertCustomerPaymentProvider("payfast", "pos")).toThrow(/platform subscriptions/);
    expect(() => getCustomerPaymentProvider("payfast")).toThrow(/platform subscriptions/);
    expect(() => getCustomerPaymentProvider("cash")).toThrow(/till/);
  });

  it("registers confirming rails, not cash", () => {
    const ids = listCustomerPaymentProviders().map((row) => row.id);
    expect(ids).toEqual(["ozow", "card_terminal"]);
    expect(ids).not.toContain("cash");
    expect(ids).not.toContain("payfast");
  });

  it("calculates cash change independently of online rails", () => {
    expect(settleTillCash(350, 500)).toEqual({
      ok: true,
      total: 350,
      amountTendered: 500,
      changeDue: 150,
      settlement: "till",
    });
  });

  it("does not complete digital payment without Ozow confirmation", async () => {
    expect(ozowCredentialsPresent({})).toBe(false);
    const charge = await ozowProvider.createCharge({ id: "i2", amount: 50 });
    expect(charge.status).not.toBe("paid");
    expect(charge.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("does not complete digital even when Ozow credentials are present until the webhook confirms", async () => {
    const keys = ["OZOW_SITE_CODE", "OZOW_API_KEY", "OZOW_PRIVATE_KEY"];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.OZOW_SITE_CODE = "TSTSTE0001";
    process.env.OZOW_API_KEY = "key";
    process.env.OZOW_PRIVATE_KEY = "private";
    try {
      expect(ozowCredentialsPresent()).toBe(true);
      const charge = await ozowProvider.createCharge({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        amount: 10,
        currency: "ZAR",
        source_kind: "document",
        document_id: "inv-1",
        org_id: "org-1",
        metadata: { invoice_number: "INV-1" },
      });
      expect(charge.status).not.toBe("paid");
      expect(charge.status).toBe("requires_action");
      expect(charge.code).toBe("OZOW_REDIRECT");
      expect(charge.next_action.redirect_url).toContain("pay.ozow.com");
    } finally {
      for (const key of keys) {
        if (previous[key] == null) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
});
