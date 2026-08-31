import { describe, expect, it } from "vitest";
import { buildInvoiceFromPosSale } from "../../server/src/pos/posSaleInvoiceMath.js";

const sale = {
  id: "11111111-1111-4111-8111-111111111111",
  org_id: "org-1",
  receipt_number: "POS-20260828-AB12",
  sale_kind: "sale",
  status: "completed",
  client_id: "22222222-2222-4222-8222-222222222222",
  total_amount: 90,
  currency: "ZAR",
  occurred_at: "2026-08-28T12:00:00.000Z",
  items: [
    { product_id: "prod-1", name: "Coffee", sku: "COF", quantity: 2, unit_price: 50, line_total: 100 },
  ],
  raw_payload: { discount_amount: 10, tax_amount: 0, tax_rate: 0 },
};

describe("buildInvoiceFromPosSale", () => {
  it("builds a paid tax-invoice copy, not a new receivable", () => {
    const built = buildInvoiceFromPosSale(sale, { createdBy: "user-1" });
    expect(built.ok).toBe(true);
    expect(built.invoice.status).toBe("paid");
    expect(built.invoice.pos_sale_event_id).toBe(sale.id);
    expect(built.invoice.invoice_number).toBe("INV-POS-POS-20260828-AB12");
    expect(built.invoice.total_amount).toBe(90);
    expect(built.invoice.subtotal).toBe(90);
    expect(built.items.some((row) => row.service_name === "Discount" && row.total_price === -10)).toBe(true);
    expect(built.items[0].service_id).toBe("prod-1");
    expect(built.invoice.notes).toMatch(/not a new payment request/i);
  });

  it("requires a named client", () => {
    const built = buildInvoiceFromPosSale({ ...sale, client_id: null });
    expect(built.ok).toBe(false);
    expect(built.code).toBe("CLIENT_REQUIRED");
  });

  it("rejects returns", () => {
    const built = buildInvoiceFromPosSale({ ...sale, sale_kind: "return" });
    expect(built.ok).toBe(false);
    expect(built.code).toBe("NOT_A_SALE");
  });
});
