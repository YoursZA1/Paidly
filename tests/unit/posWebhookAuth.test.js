import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyPosHmacSignature } from "../../server/src/pos/posWebhookAuth.js";

describe("verifyPosHmacSignature", () => {
  const secret = "test-webhook-secret";

  function sign(rawBody) {
    return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  }

  it("verifies HMAC against the exact raw body string", () => {
    const rawBody = '{"id":"sale-1","status":"completed","total":150}';
    const req = {
      headers: { "x-paidly-signature": sign(rawBody) },
    };
    expect(verifyPosHmacSignature(req, rawBody, secret)).toBe(true);
  });

  it("fails when a re-serialized object differs from the signed raw body", () => {
    const rawBody = '{"id":"sale-1","status":"completed","total":150}';
    const parsed = JSON.parse(rawBody);
    const req = {
      headers: { "x-paidly-signature": sign(rawBody) },
    };
    expect(verifyPosHmacSignature(req, JSON.stringify(parsed), secret)).toBe(true);
    // Whitespace change breaks signature — must use original raw bytes
    const pretty = JSON.stringify(parsed, null, 2);
    expect(verifyPosHmacSignature(req, pretty, secret)).toBe(false);
  });

  it("rejects non-string body when signature header is present", () => {
    const req = {
      headers: { "x-paidly-signature": "abc123" },
    };
    expect(verifyPosHmacSignature(req, { id: "sale-1" }, secret)).toBe(false);
  });
});
