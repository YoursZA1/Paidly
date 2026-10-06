import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/documentIssuerBrand", () => ({
  resolveIssuerBrand: () => ({
    name: "BrandCafé Agency",
    logo: "",
    address: "",
    email: "",
    phone: "",
    website: "",
    vatNumber: "",
  }),
}));

import { recordToStyledPreviewDoc } from "../../src/utils/documentPreviewData.js";

describe("recordToStyledPreviewDoc bill-to", () => {
  it("keeps the contact person, email, and phone on the preview document", () => {
    const doc = recordToStyledPreviewDoc(
      {
        invoice_number: "INV-1001",
        client_id: "cli-1",
        items: [{ service_name: "Logo Design - 3x Options", description: "Logo Design", quantity: 1, unit_price: 1500, total_price: 1500 }],
        subtotal: 1500,
        tax_amount: 150,
        total_amount: 1650,
      },
      {
        id: "cli-1",
        name: "On The Design Agency",
        contact_person: "Armando Mavelele",
        email: "onthedesignagency@gmail.com",
        phone: "+27685194266",
        tax_id: "4999999999",
      },
      "invoice",
      { company_name: "BrandCafé Agency" }
    );

    expect(doc.client_name).toBe("On The Design Agency");
    expect(doc.contact_person).toBe("Armando Mavelele");
    expect(doc.client_email).toBe("onthedesignagency@gmail.com");
    expect(doc.client_phone).toBe("+27685194266");
    expect(doc.client_vat).toBe("4999999999");
    expect(doc.items).toHaveLength(1);
  });
});
