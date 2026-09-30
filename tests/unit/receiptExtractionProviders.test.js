import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createAnthropicReceiptProvider,
  ReceiptExtractionError,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  resolveReceiptExtractionProvider,
} from "../../server/src/expenses/receiptExtractionProviders.js";

function fakeClient(impl) {
  return { beta: { messages: { create: vi.fn(impl) } } };
}

const reply = (text, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });

describe("receipt extraction providers", () => {
  it("is off unless explicitly configured", () => {
    expect(resolveReceiptExtractionProvider({})).toBeNull();
    expect(resolveReceiptExtractionProvider({ RECEIPT_EXTRACTION_PROVIDER: "anthropic" })).toBeNull();
    expect(resolveReceiptExtractionProvider({ RECEIPT_EXTRACTION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })?.id).toBe("anthropic");
  });

  it("sends the receipt with structured output and the no-invention rules", async () => {
    const client = fakeClient(async () => reply('{"isReceipt":true,"total":10}'));
    const provider = createAnthropicReceiptProvider({ apiKey: "k", client });
    const out = await provider.extract({ data: "QUJD", mediaType: "image/jpeg" });
    expect(out).toEqual({ isReceipt: true, total: 10 });
    const req = client.beta.messages.create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.output_config.format.schema.additionalProperties).toBe(false);
    expect(req.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(RECEIPT_EXTRACTION_SYSTEM_PROMPT).toMatch(/Never estimate, calculate or guess/);
    expect(RECEIPT_EXTRACTION_SYSTEM_PROMPT).toMatch(/do not assume the buyer or seller is VAT registered/);
  });

  it("sends PDFs as documents", async () => {
    const client = fakeClient(async () => reply("{}"));
    await createAnthropicReceiptProvider({ apiKey: "k", client }).extract({ data: "JVBE", mediaType: "application/pdf" });
    expect(client.beta.messages.create.mock.calls[0][0].messages[0].content[0].type).toBe("document");
  });

  it.each([
    [reply("not json"), "invalid_output"],
    [reply('{"a":', "max_tokens"), "invalid_output"],
    [{ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }, "refused"],
  ])("maps bad responses to ReceiptExtractionError(%#)", async (response, code) => {
    const provider = createAnthropicReceiptProvider({ apiKey: "k", client: fakeClient(async () => response) });
    await expect(provider.extract({ data: "x", mediaType: "image/png" })).rejects.toMatchObject({ code });
  });

  it("maps SDK errors", async () => {
    const rate = new Anthropic.RateLimitError(429, {}, "slow down", new Headers());
    const provider = createAnthropicReceiptProvider({
      apiKey: "k",
      client: fakeClient(async () => {
        throw rate;
      }),
    });
    const err = await provider.extract({ data: "x", mediaType: "image/png" }).catch((e) => e);
    expect(err).toBeInstanceOf(ReceiptExtractionError);
    expect(err.code).toBe("rate_limited");
  });
});
