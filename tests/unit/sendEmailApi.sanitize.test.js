import { describe, expect, it } from "vitest";
import { sanitizeEmailHtmlBody } from "../../server/src/inputValidation.js";

describe("send-email HTML sanitization (shared Vercel + Express)", () => {
  it("strips script tags from outbound email HTML", () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script>';
    const clean = sanitizeEmailHtmlBody(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).toContain("Hello");
  });

  it("neutralizes javascript: in href", () => {
    const dirty = '<a href="javascript:alert(1)">pay</a>';
    const clean = sanitizeEmailHtmlBody(dirty);
    expect(clean).not.toMatch(/javascript:/i);
  });
});
