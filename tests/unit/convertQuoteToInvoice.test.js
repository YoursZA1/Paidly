import { describe, expect, it, vi } from "vitest";
import {
  assertQuoteConvertible,
  convertQuoteToInvoice,
  mapQuoteItemsForInvoice,
} from "@/document-engine/convertQuoteToInvoice";
import { tableForDocumentType } from "@/document-engine/documentSystemOfRecord";

describe("assertQuoteConvertible", () => {
  it("refuses a declined quote", () => {
    expect(() => assertQuoteConvertible({ id: "q-1", status: "declined" })).toThrow(/cannot be converted/i);
  });

  it("allows draft, sent, and accepted", () => {
    expect(() => assertQuoteConvertible({ id: "q-1", status: "draft" })).not.toThrow();
    expect(() => assertQuoteConvertible({ id: "q-1", status: "sent" })).not.toThrow();
    expect(() => assertQuoteConvertible({ id: "q-1", status: "accepted" })).not.toThrow();
  });
});

describe("mapQuoteItemsForInvoice", () => {
  it("copies service_id", () => {
    const rows = mapQuoteItemsForInvoice([
      { service_id: "svc-1", service_name: "Widget", quantity: 1, unit_price: 10 },
    ]);
    expect(rows[0].service_id).toBe("svc-1");
  });
});

describe("convertQuoteToInvoice", () => {
  it("returns an existing invoice instead of creating a second", async () => {
    const createInvoice = vi.fn();
    const updateQuote = vi.fn();
    const existing = { id: "inv-1", invoice_number: "INV-1001" };
    const result = await convertQuoteToInvoice({
      quoteId: "q-1",
      getQuote: async () => ({ id: "q-1", status: "converted", items: [] }),
      findExisting: async () => existing,
      createInvoice,
      updateQuote,
    });
    expect(result.created).toBe(false);
    expect(result.invoice).toEqual(existing);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("refuses a declined quote and does not create", async () => {
    const createInvoice = vi.fn();
    await expect(
      convertQuoteToInvoice({
        quoteId: "q-1",
        getQuote: async () => ({ id: "q-1", status: "declined", items: [] }),
        findExisting: async () => null,
        createInvoice,
        updateQuote: vi.fn(),
      })
    ).rejects.toThrow(/cannot be converted/i);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("writes source_quote_id, converted status, and service_id", async () => {
    const createInvoice = vi.fn(async (payload) => ({ id: "inv-2", ...payload }));
    const updateQuote = vi.fn();
    const result = await convertQuoteToInvoice({
      quoteId: "q-1",
      getQuote: async () => ({
        id: "q-1",
        status: "accepted",
        tax_rate: 15,
        discount_amount: 0,
        subtotal: 100,
        tax_amount: 15,
        total_amount: 115,
        vat_mode: "VAT_EXCLUSIVE",
        client_id: "c-1",
        items: [{ service_id: "svc-9", service_name: "Hours", quantity: 2, unit_price: 50 }],
      }),
      findExisting: async () => null,
      createInvoice,
      updateQuote,
    });
    expect(result.created).toBe(true);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    const payload = createInvoice.mock.calls[0][0];
    expect(payload.source_quote_id).toBe("q-1");
    expect(payload.items[0].service_id).toBe("svc-9");
    expect(payload.subtotal).toBe(100);
    expect(payload.tax_amount).toBe(15);
    expect(payload.total_amount).toBe(115);
    expect(payload.vat_mode).toBe("VAT_EXCLUSIVE");
    expect(payload.keep_stored_totals).toBe(true);
    expect(updateQuote).toHaveBeenCalledWith(
      "q-1",
      expect.objectContaining({ status: "converted" })
    );
    expect(tableForDocumentType("invoice")).toBe("invoices");
  });

  it("copies inclusive quote totals without recalculating", async () => {
    const createInvoice = vi.fn(async (payload) => ({ id: "inv-3", ...payload }));
    await convertQuoteToInvoice({
      quoteId: "q-inc",
      getQuote: async () => ({
        id: "q-inc",
        status: "accepted",
        vat_mode: "VAT_INCLUSIVE",
        tax_rate: 15,
        subtotal: 1000,
        tax_amount: 123.45,
        total_amount: 1123.45,
        discount_amount: 0,
        items: [{ service_name: "Design", quantity: 1, unit_price: 1150, total_price: 1150 }],
      }),
      findExisting: async () => null,
      createInvoice,
      updateQuote: vi.fn(),
    });
    const payload = createInvoice.mock.calls[0][0];
    expect(payload.vat_mode).toBe("VAT_INCLUSIVE");
    expect(payload.subtotal).toBe(1000);
    expect(payload.tax_amount).toBe(123.45);
    expect(payload.total_amount).toBe(1123.45);
    expect(payload.keep_stored_totals).toBe(true);
  });
});
