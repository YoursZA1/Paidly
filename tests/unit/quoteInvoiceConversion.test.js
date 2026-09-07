import { describe, expect, it } from "vitest";
import {
  QUOTE_STATUS,
  buildInvoiceFromQuote,
  canConvertQuote,
  convertQuoteWithStore,
  copyQuoteLineItems,
  isQuoteConverted,
  isQuoteImmutable,
  normalizeQuoteStatus,
} from "@shared/commercial/quoteInvoiceConversion.js";

function sampleQuote(overrides = {}) {
  return {
    id: "quote-1",
    org_id: "org-1",
    client_id: "client-1",
    company_id: "brand-1",
    quote_number: "QUO-1001",
    status: QUOTE_STATUS.accepted,
    project_title: "Kitchen remodel",
    project_description: "Scope",
    valid_until: "2026-10-01",
    subtotal: 1000,
    tax_rate: 15,
    tax_amount: 150,
    total_amount: 1150,
    currency: "ZAR",
    notes: "Net 14",
    terms_conditions: "Standard terms",
    banking_detail_id: "bank-1",
    owner_company_name: "Paidly Studio",
    owner_company_address: "1 Loop St",
    owner_logo_url: "https://example.com/logo.png",
    owner_email: "hello@paidly.test",
    owner_currency: "ZAR",
    document_brand_primary: "#111111",
    document_brand_secondary: "#222222",
    discount_type: "percentage",
    discount_value: 10,
    discount_amount: 100,
    items: [
      {
        service_name: "Design",
        description: "Concept",
        quantity: 2,
        unit_price: 500,
        total_price: 1000,
        sku: "DES-1",
      },
    ],
    ...overrides,
  };
}

describe("quote status vocabulary", () => {
  it("maps rejected to declined", () => {
    expect(normalizeQuoteStatus("rejected")).toBe(QUOTE_STATUS.declined);
  });

  it("treats converted quotes as immutable", () => {
    expect(isQuoteImmutable({ status: "converted", converted_at: "2026-09-06T00:00:00.000Z" })).toBe(true);
    expect(isQuoteImmutable({ status: "accepted" })).toBe(false);
  });
});

describe("successful conversion payload", () => {
  it("copies customer, issuer, tax, discount, notes, and line items", () => {
    const built = buildInvoiceFromQuote(sampleQuote(), {
      invoiceNumber: "INV-1001",
      createdBy: "user-1",
      invoiceDate: "2026-09-06",
    });
    expect(built.already_converted).toBe(false);
    expect(built.invoice.source_quote_id).toBe("quote-1");
    expect(built.invoice.client_id).toBe("client-1");
    expect(built.invoice.company_id).toBe("brand-1");
    expect(built.invoice.owner_company_name).toBe("Paidly Studio");
    expect(built.invoice.owner_logo_url).toBe("https://example.com/logo.png");
    expect(built.invoice.document_brand_primary).toBe("#111111");
    expect(built.invoice.tax_rate).toBe(15);
    expect(built.invoice.vat_mode).toBe("VAT_EXCLUSIVE");
    expect(built.invoice.tax_amount).toBe(150);
    expect(built.invoice.subtotal).toBe(1000);
    expect(built.invoice.total_amount).toBe(1150);
    expect(built.invoice.discount_amount).toBe(100);
    expect(built.invoice.discount_type).toBe("percentage");
    expect(built.invoice.discount_value).toBe(10);
    expect(built.invoice.notes).toBe("Net 14");
    expect(built.invoice.terms_conditions).toBe("Standard terms");
    expect(built.invoice.invoice_number).toBe("INV-1001");
    expect(built.invoice.status).toBe("draft");
    expect(built.items).toHaveLength(1);
    expect(built.items[0]).toMatchObject({
      service_name: "Design",
      quantity: 2,
      unit_price: 500,
      total_price: 1000,
      sku: "DES-1",
    });
  });

  it("preserves VAT and discount on copied totals instead of recalculating", () => {
    const built = buildInvoiceFromQuote(
      sampleQuote({
        subtotal: 500,
        tax_rate: 15,
        tax_amount: 67.5,
        total_amount: 517.5,
        discount_amount: 50,
      })
    );
    expect(built.invoice.tax_amount).toBe(67.5);
    expect(built.invoice.total_amount).toBe(517.5);
    expect(built.invoice.discount_amount).toBe(50);
  });

  it("copies VAT_INCLUSIVE mode and stored totals", () => {
    const built = buildInvoiceFromQuote(
      sampleQuote({
        vat_mode: "VAT_INCLUSIVE",
        subtotal: 1000,
        tax_amount: 150,
        total_amount: 1150,
      })
    );
    expect(built.invoice.vat_mode).toBe("VAT_INCLUSIVE");
    expect(built.invoice.subtotal).toBe(1000);
    expect(built.invoice.tax_amount).toBe(150);
    expect(built.invoice.total_amount).toBe(1150);
  });
});

describe("duplicate conversion", () => {
  it("returns the existing invoice instead of building another", () => {
    const existing = { id: "inv-existing", invoice_number: "INV-1001", source_quote_id: "quote-1" };
    const built = buildInvoiceFromQuote(sampleQuote({ status: "converted", converted_at: "2026-09-06" }), {
      existingInvoice: existing,
    });
    expect(built.already_converted).toBe(true);
    expect(built.invoice.id).toBe("inv-existing");
  });

  it("refuses a second convert in the store and keeps a single invoice", () => {
    const quote = sampleQuote();
    const store = {
      quotes: new Map([[quote.id, quote]]),
      invoices: new Map(),
      invoiceItems: [],
    };
    const first = convertQuoteWithStore(store, quote.id, { invoiceNumber: "INV-1001", invoiceId: "inv-1" });
    const second = convertQuoteWithStore(store, quote.id, { invoiceNumber: "INV-1002", invoiceId: "inv-2" });
    expect(first.already_converted).toBe(false);
    expect(second.already_converted).toBe(true);
    expect(second.invoice.id).toBe("inv-1");
    expect(store.invoices.size).toBe(1);
    expect(store.quotes.get(quote.id).status).toBe(QUOTE_STATUS.converted);
    expect(canConvertQuote(store.quotes.get(quote.id), second.invoice)).toBe(false);
  });
});

describe("failed conversion rollback", () => {
  it("restores quote and invoice state when item insert fails", () => {
    const quote = sampleQuote();
    const store = {
      quotes: new Map([[quote.id, quote]]),
      invoices: new Map(),
      invoiceItems: [],
    };
    expect(() =>
      convertQuoteWithStore(store, quote.id, { invoiceId: "inv-1", failAfter: "items" })
    ).toThrow(/forced fail after items/);
    expect(store.invoices.size).toBe(0);
    expect(store.invoiceItems).toEqual([]);
    expect(store.quotes.get(quote.id).status).toBe(QUOTE_STATUS.accepted);
    expect(isQuoteConverted(store.quotes.get(quote.id))).toBe(false);
  });
});

describe("converted quote cannot be converted again", () => {
  it("blocks canConvertQuote after conversion", () => {
    const quote = sampleQuote({ status: QUOTE_STATUS.converted, converted_at: "2026-09-06T00:00:00.000Z" });
    expect(canConvertQuote(quote)).toBe(false);
    expect(() => buildInvoiceFromQuote(quote)).not.toThrow();
    const built = buildInvoiceFromQuote(quote, { existingInvoice: { id: "inv-1" } });
    expect(built.already_converted).toBe(true);
  });

  it("refuses declined quotes", () => {
    expect(canConvertQuote(sampleQuote({ status: "declined" }))).toBe(false);
    expect(() => buildInvoiceFromQuote(sampleQuote({ status: "declined" }))).toThrow(/cannot be converted/);
  });

  it("allows draft quotes", () => {
    expect(canConvertQuote(sampleQuote({ status: "draft" }))).toBe(true);
  });
});

describe("company and issuer preservation", () => {
  it("copies issuer snapshot fields onto the invoice", () => {
    const built = buildInvoiceFromQuote(
      sampleQuote({
        owner_company_name: "Ridge Electrical",
        owner_company_address: "12 Main Rd",
        owner_email: "accounts@ridge.test",
        owner_logo_url: "https://cdn.example/ridge.png",
        owner_currency: "ZAR",
        document_brand_primary: "#0A3D62",
        document_brand_secondary: "#3C7A89",
      })
    );
    expect(built.invoice.owner_company_name).toBe("Ridge Electrical");
    expect(built.invoice.owner_company_address).toBe("12 Main Rd");
    expect(built.invoice.owner_email).toBe("accounts@ridge.test");
    expect(built.invoice.owner_logo_url).toBe("https://cdn.example/ridge.png");
    expect(built.invoice.owner_currency).toBe("ZAR");
    expect(built.invoice.document_brand_primary).toBe("#0A3D62");
    expect(built.invoice.document_brand_secondary).toBe("#3C7A89");
  });
});

describe("VAT preservation", () => {
  it("copies tax_rate and tax_amount without recalculating", () => {
    const built = buildInvoiceFromQuote(
      sampleQuote({
        tax_rate: 15,
        tax_amount: 123.45,
        total_amount: 999.99,
      })
    );
    expect(built.invoice.tax_rate).toBe(15);
    expect(built.invoice.tax_amount).toBe(123.45);
    expect(built.invoice.total_amount).toBe(999.99);
  });
});

describe("discount preservation", () => {
  it("copies header discount fields", () => {
    const built = buildInvoiceFromQuote(
      sampleQuote({
        discount_type: "fixed",
        discount_value: 25,
        discount_amount: 25,
      })
    );
    expect(built.invoice.discount_amount).toBe(25);
  });
});

describe("line-item preservation", () => {
  it("copies every commercial field from quote items", () => {
    const items = copyQuoteLineItems([
      {
        service_name: "Labour",
        description: "On site",
        quantity: 3,
        unit_price: 200,
        total_price: 600,
        sku: "LAB-9",
        item_type: "labor",
        catalog_item_id: "cat-1",
        service_id: "svc-1",
        unit_type: "hour",
        tax_rate: 15,
        discount: 10,
        discount_type: "fixed",
      },
    ]);
    expect(items[0]).toMatchObject({
      service_name: "Labour",
      description: "On site",
      quantity: 3,
      unit_price: 200,
      total_price: 600,
      service_id: "svc-1",
      catalog_item_id: "cat-1",
      sku: "LAB-9",
      item_type: "labor",
      unit_type: "hour",
      tax_rate: 15,
      discount: 10,
      discount_type: "fixed",
    });
  });
});
