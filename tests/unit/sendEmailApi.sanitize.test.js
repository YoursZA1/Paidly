import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeEmailHtmlBody } from "../../server/src/inputValidation.js";
import { buildDocumentShareEmailHtml } from "../../src/utils/shareEmailHtml.js";

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

  it("keeps the View Quote button styles and drops unsafe CSS", () => {
    const html = buildDocumentShareEmailHtml({
      itemType: "quote",
      message: "Please find quote QUO-1001.",
      shareUrl: "https://www.paidly.co.za/PublicQuote?token=4cbbfbc3-2b12-48b8-a279-a46ba723c965",
      companyName: "BrandCafé Agency",
      attachPdf: true,
    });
    const clean = sanitizeEmailHtmlBody(html);
    expect(clean).toContain("View Quote");
    expect(clean).toContain("background-color:#4f46e5");
    expect(clean).toContain("color:#ffffff");
    expect(clean).toContain("text-decoration:none");
    expect(clean).toContain("bgcolor=\"#4f46e5\"");
    expect(clean).toContain("A PDF copy is attached");
    expect(clean).not.toMatch(/javascript:/i);

    const unsafe = sanitizeEmailHtmlBody(
      '<a href="https://paidly.co.za" style="background:url(javascript:alert(1));color:#fff">x</a>'
    );
    expect(unsafe).not.toMatch(/url\s*\(/i);
    expect(unsafe).not.toMatch(/javascript:/i);
  });

  it("persists a quote public share token on update", () => {
    const src = readFileSync(new URL("../../src/api/entity/EntityManager.js", import.meta.url), "utf8");
    const start = src.indexOf("const QUOTE_UPDATE_COLUMNS");
    const end = src.indexOf("if (supabaseTable === 'quotes')", start);
    const block = src.slice(start, end);
    expect(block).toContain("'public_share_token'");
    expect(block).toContain("'sent_date'");
  });
});
