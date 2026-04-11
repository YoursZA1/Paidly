import { describe, expect, it } from "vitest";
import {
  linkifyPlainTextForEmail,
  buildAdminPlatformOutreachHtml,
  buildAdminPlatformOutreachPlainText,
} from "../../server/src/adminPlatformMailerTemplate.js";

describe("linkifyPlainTextForEmail", () => {
  it("escapes HTML and preserves newlines", () => {
    const h = linkifyPlainTextForEmail("a <b> & c\nline2");
    expect(h).toContain("&lt;b&gt;");
    expect(h).toContain("&amp;");
    expect(h).toContain("<br/>");
  });

  it("wraps safe https URLs in anchors", () => {
    const h = linkifyPlainTextForEmail("See https://www.paidly.co.za for more.");
    expect(h).toContain('href="https://www.paidly.co.za"');
    expect(h).toContain("noopener noreferrer");
  });
});

describe("buildAdminPlatformOutreachHtml", () => {
  it("includes header, body, and CTA", () => {
    const html = buildAdminPlatformOutreachHtml({ plainBody: "Hello team." });
    expect(html).toContain("Paidly");
    expect(html).toContain("Hello team.");
    expect(html).toContain("Open Paidly");
    expect(html).toContain('role="presentation"');
  });
});

describe("buildAdminPlatformOutreachPlainText", () => {
  it("includes body, links, and recipient line when provided", () => {
    const text = buildAdminPlatformOutreachPlainText({
      plainBody: "Hi there.",
      recipientEmail: "user@example.com",
    });
    expect(text).toContain("PAIDLY");
    expect(text).toContain("Hi there.");
    expect(text).toContain("user@example.com");
    expect(text).toContain("Open Paidly:");
  });
});
