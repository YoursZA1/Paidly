import { describe, expect, it } from "vitest";
import { generateHubDocumentEmailHtml, hubDocumentEmailSubject } from "../../src/services/DocumentEmailService.js";

describe("hub document email", () => {
  it("uses the invoice and quote shell: greeting, summary, and Paidly orange button", () => {
    const html = generateHubDocumentEmailHtml({
      doc: {
        type: "contract",
        document_number: "CON-1001",
        title: "Contract — ABC party",
      },
      recipientName: "On The Design Agency",
      company: { company_name: "BrandCafé Agency" },
      message: "Your contract is ready. Open it with the button below.",
      shareUrl: "https://paidly.co.za/PublicDocument?token=4cbbfbc3-2b12-48b8-a279-a46ba723c965",
      includePdf: false,
    });

    expect(hubDocumentEmailSubject("BrandCafé Agency", "Contract")).toBe("BrandCafé Agency contract");
    expect(html).toContain("Dear On The Design Agency");
    expect(html).toContain("CON-1001");
    expect(html).toContain("View Contract");
    expect(html).toContain("bgcolor=\"#f24e00\"");
    expect(html).toContain("PublicDocument?token=");
    expect(html).not.toContain("Hi Contract");
  });
});
