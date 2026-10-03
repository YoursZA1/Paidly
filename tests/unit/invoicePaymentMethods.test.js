import { describe, expect, it } from "vitest";
import {
  INVOICE_PAYMENT_CHOICES,
  invoicePaymentMethodLabel,
  isOnlineInvoicePaymentMethod,
  normalizeOfflineInvoiceMethod,
} from "../../shared/payments/invoicePaymentMethods.js";

describe("invoice payment methods", () => {
  it("keeps cash, EFT, card, POS and other off the online rail", () => {
    for (const value of ["cash", "eft", "card", "pos", "other", "bank_transfer"]) {
      expect(normalizeOfflineInvoiceMethod(value)).toBe(value);
      expect(isOnlineInvoicePaymentMethod(value)).toBe(false);
    }
    expect(normalizeOfflineInvoiceMethod("digital")).toBeNull();
    expect(isOnlineInvoicePaymentMethod("digital")).toBe(true);
    expect(normalizeOfflineInvoiceMethod("ozow")).toBeNull();
  });

  it("labels recorded methods from one list", () => {
    expect(invoicePaymentMethodLabel("eft")).toBe("EFT / Bank Transfer");
    expect(invoicePaymentMethodLabel("bank_transfer")).toBe("EFT / Bank Transfer");
    expect(invoicePaymentMethodLabel("card")).toBe("Card");
    expect(INVOICE_PAYMENT_CHOICES.filter((choice) => choice.online).map((choice) => choice.value)).toEqual(["digital"]);
  });
});
