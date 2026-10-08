import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logoUrl", () => ({
  getLogoUrl: (path) => (path ? `https://cdn.example/${path}` : ""),
}));

vi.mock("@/lib/documentIssuerBrand", () => ({
  resolveIssuerBrand: ({ document, profile }) => ({
    name: document?.owner_company_name || profile?.company_name || "Acme Co",
    logo: document?.owner_logo_url || profile?.logo_url || "",
    address: document?.owner_company_address || profile?.company_address || "",
    email: document?.owner_email || profile?.email || "",
    phone: document?.owner_phone || profile?.phone || "",
    website: profile?.website || "",
    vatNumber: document?.owner_vat_number || profile?.vat_number || "",
    brandPrimary: document?.document_brand_primary || profile?.document_brand_primary || null,
    brandSecondary: null,
    currency: document?.currency || "ZAR",
  }),
}));

import { mapInvoicePdfData, mapQuotePdfData } from "@/components/pdf/mapInvoicePdfData";

const baseInvoice = {
  invoice_number: "INV-1004",
  status: "sent",
  invoice_date: "2026-09-16",
  delivery_date: "2026-09-30",
  subtotal: 1000,
  tax_rate: 15,
  tax_amount: 150,
  discount_amount: 50,
  total_amount: 1100,
  currency: "ZAR",
  notes: "Thank you",
  terms_conditions: "Due within 15 days",
  owner_company_name: "Acme Co",
  owner_company_address: "1 Main Rd",
  owner_email: "billing@acme.test",
  owner_vat_number: "4123456789",
  document_brand_primary: "#0f766e",
  items: [
    {
      service_name: "Design",
      description: "Brand refresh",
      quantity: 2,
      unit_price: 250,
      total_price: 500,
    },
    {
      name: "Hosting",
      quantity: 1,
      unit_price: 500,
      total: 500,
    },
  ],
};

const client = {
  name: "Client Pty",
  email: "a@client.test",
  address: "2 Client St",
  phone: "0110000000",
  vat_number: "4987654321",
};

const user = {
  company_name: "Acme Co",
  currency: "ZAR",
  document_brand_primary: "#0f766e",
};

const banking = {
  bank_name: "FNB",
  account_name: "Acme Co",
  account_number: "62123456789",
  branch_code: "250655",
};

describe("mapInvoicePdfData", () => {
  it("maps stored totals without inventing NaN/undefined strings", () => {
    const data = mapInvoicePdfData(baseInvoice, client, user, banking);
    expect(data.number).toBe("INV-1004");
    expect(data.subtotal).toBe(1000);
    expect(data.tax_amount).toBe(150);
    expect(data.discount_amount).toBe(50);
    expect(data.total).toBe(1100);
    expect(data.brandPrimary).toBe("#0f766e");
    expect(data.statusLabel).toBe("");
    expect(data.items).toHaveLength(2);
    expect(data.items[0].description).toContain("Design");
    expect(data.bankingRows?.some((r) => r.label === "Bank")).toBe(true);
    const displayBlob = [
      data.number,
      data.brand,
      data.statusLabel,
      data.formattedTotal,
      data.issuedDateFormatted,
      ...data.items.map((i) => i.description),
      ...(data.bankingRows || []).map((r) => `${r.label}: ${r.value}`),
    ].join(" | ");
    expect(displayBlob).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/);
  });

  it("hides empty optional banking and zero discount/tax gracefully", () => {
    const data = mapInvoicePdfData(
      {
        ...baseInvoice,
        tax_rate: 0,
        tax_amount: 0,
        discount_amount: 0,
        notes: "",
        terms_conditions: "",
        owner_vat_number: "",
      },
      { name: "Client" },
      user,
      null
    );
    expect(data.bankingRows).toBeNull();
    expect(data.discount_amount).toBe(0);
    expect(data.tax_amount).toBe(0);
    expect(data.notes).toBe("");
    expect(data.issuer.vatNumber).toBe("");
  });

  it("supports amount_paid / balance_due when present", () => {
    const data = mapInvoicePdfData(
      { ...baseInvoice, amount_paid: 400, balance_due: 700, status: "partially_paid" },
      client,
      user,
      banking
    );
    expect(data.amount_paid).toBe(400);
    expect(data.balance_due).toBe(700);
    expect(data.statusLabel).toBe("Partially Paid");
  });

  it("maps draft / paid / overdue status labels and leaves sent and viewed off the PDF", () => {
    expect(mapInvoicePdfData({ ...baseInvoice, status: "draft" }, client, user).statusLabel).toBe(
      "Draft"
    );
    expect(mapInvoicePdfData({ ...baseInvoice, status: "paid" }, client, user).statusLabel).toBe(
      "Paid"
    );
    expect(mapInvoicePdfData({ ...baseInvoice, status: "overdue" }, client, user).statusLabel).toBe(
      "Overdue"
    );
    expect(mapInvoicePdfData({ ...baseInvoice, status: "sent" }, client, user).statusLabel).toBe("");
    expect(mapInvoicePdfData({ ...baseInvoice, status: "viewed" }, client, user).statusLabel).toBe("");
    expect(mapQuotePdfData({ ...baseInvoice, status: "viewed", quote_number: "QUO-1" }, client, user).statusLabel).toBe("");
  });

  it("handles long descriptions and many line items", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      name: `Service line ${i + 1} with a particularly long name that should wrap`,
      description: "Additional detail ".repeat(8),
      quantity: 1 + (i % 3),
      unit_price: 100 + i,
      total_price: (1 + (i % 3)) * (100 + i),
    }));
    const data = mapInvoicePdfData({ ...baseInvoice, items }, client, user, banking);
    expect(data.items).toHaveLength(25);
    expect(data.items[0].description.length).toBeGreaterThan(20);
  });

  it("maps a quote as a quote, with its number and valid-until date", () => {
    const data = mapQuotePdfData(
      {
        quote_number: "QUO-1001",
        status: "sent",
        created_at: "2026-10-06",
        valid_until: "2026-10-09",
        project_title: "Quote for On The Design Agency",
        total_amount: 1650,
        currency: "ZAR",
        owner_company_name: "BrandCafé Agency",
        items: [{ service_name: "Design", quantity: 1, unit_price: 1650, total_price: 1650 }],
      },
      { name: "On The Design Agency", email: "hello@design.test" },
      { company_name: "BrandCafé Agency", currency: "ZAR" }
    );
    expect(data.documentTitle).toBe("QUOTE");
    expect(data.dueLabel).toBe("Valid until");
    expect(data.totalLabel).toBe("Total");
    expect(data.number).toBe("QUO-1001");
    expect(data.dueDateFormatted).toContain("2026");
    expect(data.client.name).toBe("On The Design Agency");
    expect(data.items).toHaveLength(1);
    expect(data.total).toBe(1650);
  });

  it("keeps bill-to, payment details, and terms when they live on the quote", () => {
    const data = mapQuotePdfData(
      {
        quote_number: "QUO-1001",
        status: "accepted",
        created_at: "2026-10-06",
        valid_until: "2026-10-09",
        terms_conditions: "Payment is due within 15 days of invoice date upon acceptance.",
        client_name: "On The Design Agency",
        client_email: "onthedesignagency@gmail.com",
        client_phone: "+27685194266",
        total_amount: 1650,
        currency: "ZAR",
      },
      { contact_person: "Armando Mavelele" },
      { company_name: "BrandCafé Agency" },
      {
        bank_name: "Nedbank Limited",
        account_name: "BrandCafe Agency",
        account_number: "1336245093",
        routing_number: "198764",
        additional_info: "Auto-created from Default Bank Details",
      }
    );
    expect(data.client.name).toBe("On The Design Agency");
    expect(data.client.email).toBe("onthedesignagency@gmail.com");
    expect(data.client.phone).toBe("+27685194266");
    expect(data.client.contactPerson).toBe("Armando Mavelele");
    expect(data.paymentTerms).toContain("15 days");
    expect(data.bankingRows.map((row) => row.label)).toEqual([
      "Bank",
      "Account name",
      "Account number",
      "Branch / routing",
      "Payment reference",
    ]);
    expect(data.bankingRows.find((row) => row.label === "Payment reference")?.value).toBe("QUO-1001");
  });

  it("keeps bill-to contact and phone when they are stored on the invoice", () => {
    const data = mapInvoicePdfData(
      {
        invoice_number: "INV-1001",
        client_name: "On The Design Agency",
        client_email: "onthedesignagency@gmail.com",
        client_phone: "+27685194266",
        contact_person: "Armando Mavelele",
        client_vat_number: "4999999999",
        total_amount: 1650,
        currency: "ZAR",
        items: [
          {
            service_name: "Logo Design - 3x Options",
            description: "Logo Design",
            quantity: 1,
            unit_price: 1500,
            total_price: 1500,
          },
        ],
      },
      {},
      { company_name: "BrandCafé Agency" }
    );
    expect(data.client.name).toBe("On The Design Agency");
    expect(data.client.contactPerson).toBe("Armando Mavelele");
    expect(data.client.email).toBe("onthedesignagency@gmail.com");
    expect(data.client.phone).toBe("+27685194266");
    expect(data.client.vatNumber).toBe("4999999999");
    expect(data.items[0].description).toBe("Logo Design - 3x Options");
  });
});
