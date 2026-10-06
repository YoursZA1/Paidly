import { describe, expect, it } from "vitest";
import { mapHubDocumentPdfData } from "../../src/components/documents/mapHubDocumentPdfData.js";

describe("mapHubDocumentPdfData", () => {
  it("uses the clean document sheet for a contract, without a line-item table", () => {
    const data = mapHubDocumentPdfData(
      {
        type: "contract",
        title: "Contract — ABC party",
        status: "draft",
        document_number: "CON-1001",
        body: "PROFESSIONAL SERVICES AGREEMENT",
        created_at: "2026-10-07",
        metadata: {
          form: {
            counterparty: "ABC party",
            effective_date: "2026-10-07",
            expiry_date: "2026-10-08",
            summary: "Short overview.",
            notes: "PROFESSIONAL SERVICES AGREEMENT",
          },
        },
      },
      { name: "On The Design Agency", email: "onthedesignagency@gmail.com" },
      { company_name: "BrandCafé Agency", email: "create@brand-cafe.co.za", phone: "+27845288180" }
    );

    expect(data.documentTitle).toBe("CONTRACT");
    expect(data.showFinancials).toBe(false);
    expect(data.parties).toEqual([
      expect.objectContaining({
        label: "Between",
        name: "On The Design Agency",
        role: "Client",
      }),
      expect.objectContaining({
        label: "And",
        name: "BrandCafé Agency",
        role: "Service Provider",
      }),
    ]);
    expect(data.parties[0].lines).toContain("onthedesignagency@gmail.com");
    expect(data.effectiveDateLine).toBe("7 October 2026");
    expect(data.issuedLabel).toBe("Effective");
    expect(data.client.name).toBe("On The Design Agency");
    expect(data.issuer.name).toBe("BrandCafé Agency");
    expect(data.issuedDateFormatted).toBe("7 October 2026");
    expect(data.dueLabel).toBe("Expires");
    expect(data.sections.some((section) => section.title === "Content")).toBe(false);
    expect(data.sections.some((section) => section.body.includes("PROFESSIONAL SERVICES AGREEMENT"))).toBe(true);
    expect(data.footerLabel).toContain("Contract CON-1001");
  });
});
