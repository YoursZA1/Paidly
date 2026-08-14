import { describe, expect, it } from "vitest";
import { parseUserIdFromSubscriptionMPaymentId } from "../../server/src/inputValidation.js";
import {
  buildSubscriptionCheckoutUnsignedPayload,
  splitPayfastBuyerName,
} from "../../server/src/billing/subscriptionApi.js";
import {
  describePayfastCheckoutSignature,
  generatePayFastSignature,
} from "../../server/src/payfastCustomSignature.js";

const USER_ID = "11111111-2222-4333-a444-555555555555";
const LEGACY_MPAY = `sub_${USER_ID}_1710000000000`;
const CURRENT_MPAY = `sub_${USER_ID}_1710000000000_deadbeefcafebabe`;

/** Pre-fix edge-function regex: only `sub_<uuid>_<digits>$`. */
const LEGACY_SUB_MPAY_RE =
  /^sub_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_\d+$/i;

/** Current edge-function regex: same as Node `parseUserIdFromSubscriptionMPaymentId`. */
const EDGE_SUB_MPAY_RE =
  /^sub_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_(.+)$/i;

const PLAN = {
  slug: "starter",
  name: "Starter",
  description: "Paidly Starter subscription",
  payfast_item_name: "Paidly Starter",
  billing_cycle: "monthly",
  amount: 149,
  currency: "ZAR",
};

function samplePayload(overrides = {}) {
  return buildSubscriptionCheckoutUnsignedPayload({
    merchantId: "10000100",
    merchantKey: "46f0cd694581a",
    returnUrl: "https://paidly.co.za/success",
    cancelUrl: "https://paidly.co.za/cancel",
    notifyUrl: "https://paidly.co.za/api/payfast/itn",
    email: "buyer@example.com",
    fullName: "Ada Lovelace",
    mPaymentId: CURRENT_MPAY,
    userId: USER_ID,
    plan: PLAN,
    billingDate: "2026-08-14",
    ...overrides,
  });
}

describe("parseUserIdFromSubscriptionMPaymentId", () => {
  it("extracts the user id from the current timestamp_hex format", () => {
    expect(parseUserIdFromSubscriptionMPaymentId(CURRENT_MPAY)).toBe(USER_ID);
  });

  it("extracts the user id from the legacy digits-only suffix", () => {
    expect(parseUserIdFromSubscriptionMPaymentId(LEGACY_MPAY)).toBe(USER_ID);
  });

  it("rejects ids that are not sub_<uuid>_<unique>", () => {
    expect(parseUserIdFromSubscriptionMPaymentId("sub_diagnostic_preview")).toBeNull();
    expect(parseUserIdFromSubscriptionMPaymentId(USER_ID)).toBeNull();
  });
});

describe("legacy edge SUB_MPAY_RE", () => {
  it("matched digits-only ids but missed the current timestamp_hex format", () => {
    expect(LEGACY_SUB_MPAY_RE.test(LEGACY_MPAY)).toBe(true);
    expect(LEGACY_SUB_MPAY_RE.test(CURRENT_MPAY)).toBe(false);
  });

  it("the aligned edge regex extracts the user id from both formats", () => {
    expect(EDGE_SUB_MPAY_RE.exec(LEGACY_MPAY)?.[1]).toBe(USER_ID);
    expect(EDGE_SUB_MPAY_RE.exec(CURRENT_MPAY)?.[1]).toBe(USER_ID);
  });
});

describe("splitPayfastBuyerName", () => {
  it("splits first and remaining tokens", () => {
    expect(splitPayfastBuyerName("Ada Lovelace")).toEqual({
      name_first: "Ada",
      name_last: "Lovelace",
    });
    expect(splitPayfastBuyerName("Mary Ann Evans")).toEqual({
      name_first: "Mary",
      name_last: "Ann Evans",
    });
  });
});

describe("buildSubscriptionCheckoutUnsignedPayload", () => {
  it("includes name_first and name_last in Custom Integration order", () => {
    const payload = samplePayload();
    expect(payload.name_first).toBe("Ada");
    expect(payload.name_last).toBe("Lovelace");
    expect(payload.email_address).toBe("buyer@example.com");
    const keys = Object.keys(payload);
    expect(keys.indexOf("name_first")).toBeLessThan(keys.indexOf("email_address"));
    expect(keys.indexOf("name_last")).toBeLessThan(keys.indexOf("email_address"));
  });

  it("changes the checkout signature when buyer names are present", () => {
    const withNames = samplePayload({ fullName: "Ada Lovelace" });
    const withoutNames = samplePayload({ fullName: "" });
    const passphrase = "jt7NOE43FZPn";
    expect(generatePayFastSignature(withNames, passphrase)).not.toBe(
      generatePayFastSignature(withoutNames, passphrase)
    );
    const diag = describePayfastCheckoutSignature(withNames, passphrase);
    expect(diag.includedFields).toContain("name_first");
    expect(diag.includedFields).toContain("name_last");
  });
});
