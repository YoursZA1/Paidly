import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifyPaidlyPaySignature } from "../../server/src/paidlyPay/paidlyPayHmac.js";
import {
  isMockPaymentsEnabled,
  providerForPaidlyPayMethod,
  publicStatusFromIntent,
} from "../../shared/payments/paidlyPayContract.js";

describe("Paidly Pay HMAC and contract", () => {
  const secret = "webhook-secret";

  it("verifies HMAC against the raw body and rejects a re-serialized object", () => {
    const rawBody = '{"event":"payment.succeeded","payment_intent_id":"pi_1"}';
    const signature = hmacSha256Hex(rawBody, secret);
    expect(verifyPaidlyPaySignature(rawBody, signature, secret)).toBe(true);
    const pretty = JSON.stringify(JSON.parse(rawBody), null, 2);
    expect(verifyPaidlyPaySignature(pretty, signature, secret)).toBe(false);
    expect(verifyPaidlyPaySignature({ event: "payment.succeeded" }, signature, secret)).toBe(false);
  });

  it("maps Paidly Pay methods onto existing rails and public statuses", () => {
    expect(providerForPaidlyPayMethod("tap_to_pay")).toBe("card_terminal");
    expect(providerForPaidlyPayMethod("qr")).toBe("card_terminal");
    expect(providerForPaidlyPayMethod("eft")).toBe("ozow");
    expect(publicStatusFromIntent({ status: "paid" })).toBe("succeeded");
    expect(publicStatusFromIntent({ status: "pending" })).toBe("created");
  });

  it("does not enable mock payments in production without an explicit override", () => {
    expect(isMockPaymentsEnabled({ PAYMENT_PROVIDER_MODE: "mock", NODE_ENV: "test" })).toBe(true);
    expect(isMockPaymentsEnabled({ PAYMENT_PROVIDER_MODE: "mock", NODE_ENV: "production" })).toBe(false);
    expect(
      isMockPaymentsEnabled({ PAYMENT_PROVIDER_MODE: "mock", NODE_ENV: "production", ALLOW_MOCK_PAYMENTS: "1" })
    ).toBe(true);
    expect(isMockPaymentsEnabled({ PAYMENT_PROVIDER_MODE: "live", NODE_ENV: "test" })).toBe(false);
  });
});
