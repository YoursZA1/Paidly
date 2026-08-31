import { describe, it, expect } from "vitest";
import {
  buildPosReceiptView,
  formatReceiptMoney,
  paymentMethodLabel,
  receiptPdfFilename,
  renderPosReceiptInnerHtml,
} from "../../server/src/pos/posReceipt.js";

describe("POS receipts", () => {
  const sale = {
    id: "sale-1",
    receipt_number: "POS-20260828-AB12",
    sale_kind: "sale",
    occurred_at: "2026-08-28T12:00:00.000Z",
    currency: "ZAR",
    payment_method: "cash",
    total_amount: 90,
    amount_tendered: 100,
    change_due: 10,
    items: [{ name: "Coffee", quantity: 2, unit_price: 50, line_total: 100 }],
    raw_payload: {
      brand_name: "Harbour Cafe",
      cashier_name: "Ada",
      customer_name: "Walk-in",
      subtotal: 100,
      discount_amount: 10,
      tax_amount: 0,
    },
  };

  it("labels payment methods and names the PDF after the sale number", () => {
    expect(paymentMethodLabel("digital")).toBe("Digital Payment");
    expect(receiptPdfFilename({ saleNumber: "POS-20260828-AB12" })).toBe("POS-20260828-AB12.pdf");
    expect(formatReceiptMoney(10, "ZAR")).toMatch(/10/);
  });

  it("builds a retail receipt with brand, staff, lines, discount, tax, total, and change", () => {
    const view = buildPosReceiptView(sale);
    expect(view.kindLabel).toBe("Receipt");
    expect(view.notice).toMatch(/not an invoice/i);
    expect(view.brandName).toBe("Harbour Cafe");
    expect(view.saleNumber).toBe("POS-20260828-AB12");
    expect(view.cashierName).toBe("Ada");
    expect(view.items[0]).toMatchObject({ name: "Coffee", quantity: 2, unitPrice: 50 });
    expect(view.discountAmount).toBe(10);
    expect(view.taxAmount).toBe(0);
    expect(view.total).toBe(90);
    expect(view.paymentLabel).toBe("Cash");
    expect(view.changeDue).toBe(10);
  });

  it("renders those fields in HTML without invoice copy", () => {
    const html = renderPosReceiptInnerHtml(buildPosReceiptView(sale));
    expect(html).toContain("Harbour Cafe");
    expect(html).toContain("POS-20260828-AB12");
    expect(html).toContain("Ada");
    expect(html).toContain("Coffee");
    expect(html).toContain("Discount");
    expect(html).toContain("Tax");
    expect(html).toContain("Change");
    expect(html).toContain("Cash");
    expect(html).toMatch(/not an invoice/i);
    expect(html).not.toMatch(/invoice #/i);
  });
});
