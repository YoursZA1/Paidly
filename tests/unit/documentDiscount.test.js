import { describe, expect, it } from "vitest";
import {
  DISCOUNT_TYPE,
  VAT_MODE,
  calculateCommercialDocument,
  persistCommercialDiscountFields,
  resolveCommercialDocumentTotals,
  sumProductLineTotals,
  storedTaxableAmount,
  toPersistableLineItems,
} from "@shared/commercial/index.js";
import { invoiceToCsvRow } from "@/utils/invoiceCsvMapping";
import { TaxService } from "@/services/TaxService";
import { getInvoiceRemainingBalance } from "@/logic/invoiceLogic";
import { copyQuoteLineItems } from "@shared/commercial/quoteInvoiceConversion.js";

const line = { quantity: 1, unitPrice: 5000, taxRate: 15 };

describe("document discount identity", () => {
  it("applies a 10% document discount", () => {
    const result = calculateCommercialDocument({
      lines: [line],
      documentDiscount: 10,
      documentDiscountType: DISCOUNT_TYPE.PERCENTAGE,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(5000);
    expect(result.documentDiscount).toBe(500);
    expect(result.taxableAmount).toBe(4500);
    expect(result.taxTotal).toBe(675);
    expect(result.grandTotal).toBe(5175);
    expect(result.subtotal - result.documentDiscount).toBe(result.taxableAmount);
    expect(result.taxableAmount + result.taxTotal).toBe(result.grandTotal);
    const persisted = persistCommercialDiscountFields(result, {
      discount_type: "percentage",
      discount_value: 10,
    });
    expect(persisted).toEqual({
      discount_type: "percentage",
      discount_value: 10,
      discount_amount: 500,
    });
  });

  it("applies a R500 fixed document discount", () => {
    const result = calculateCommercialDocument({
      lines: [line],
      documentDiscount: 500,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.documentDiscount).toBe(500);
    expect(result.taxableAmount).toBe(4500);
    expect(result.taxTotal).toBe(675);
    expect(result.grandTotal).toBe(5175);
  });

  it("applies a zero document discount", () => {
    const result = calculateCommercialDocument({
      lines: [line],
      documentDiscount: 0,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.documentDiscount).toBe(0);
    expect(result.taxableAmount).toBe(5000);
    expect(result.taxTotal).toBe(750);
    expect(result.grandTotal).toBe(5750);
  });

  it("caps a discount larger than the subtotal", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 400, taxRate: 15 }],
      documentDiscount: 999,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(400);
    expect(result.documentDiscount).toBe(400);
    expect(result.taxableAmount).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("applies discount + VAT inclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 115, taxRate: 15 }],
      documentDiscount: 15,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.documentDiscount).toBe(15);
    expect(result.grandTotal).toBe(100);
    expect(result.taxableAmount + result.taxTotal).toBe(result.grandTotal);
  });

  it("applies discount + VAT exclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 100, taxRate: 15 }],
      documentDiscount: 10,
      documentDiscountType: DISCOUNT_TYPE.PERCENTAGE,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(100);
    expect(result.documentDiscount).toBe(10);
    expect(result.taxableAmount).toBe(90);
    expect(result.taxTotal).toBe(13.5);
    expect(result.grandTotal).toBe(103.5);
  });
});

describe("legacy Discount lines must not double-count", () => {
  it("keeps stored historical totals when a Discount line and header amount both exist", () => {
    const record = {
      items: [
        { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
        { service_name: "Discount", quantity: 1, unit_price: -20, total_price: -20 },
      ],
      subtotal: 180,
      discount_type: "fixed",
      discount_value: 20,
      discount_amount: 20,
      tax_rate: 15,
      tax_amount: 27,
      total_amount: 207,
      vat_mode: "VAT_EXCLUSIVE",
    };
    const stored = resolveCommercialDocumentTotals(record, { preferStored: true });
    expect(stored.grandTotal).toBe(207);
    expect(stored.subtotal).toBe(180);
    expect(stored.documentDiscount).toBe(20);
    expect(stored.source).toBe("stored");
  });

  it("does not persist a synthetic Discount line", () => {
    const items = [
      { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
      { service_name: "Discount", quantity: 1, unit_price: -20, total_price: -20 },
    ];
    const persisted = toPersistableLineItems(items);
    expect(persisted.every((row) => row.service_name !== "Discount")).toBe(true);
  });

  it("skips legacy Discount lines when converting a quote", () => {
    const items = copyQuoteLineItems([
      { service_name: "Labour", quantity: 1, unit_price: 100, total_price: 100 },
      { service_name: "Discount", quantity: 1, unit_price: -10, total_price: -10 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].service_name).toBe("Labour");
  });

  it("CSV item JSON omits legacy Discount lines so SUM(items) is not double-counted", () => {
    const row = invoiceToCsvRow({
      invoice_number: "INV-1",
      subtotal: 200,
      discount_amount: 20,
      tax_amount: 27,
      total_amount: 207,
      items: [
        { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
        { service_name: "Discount", quantity: 1, unit_price: -20, total_price: -20 },
      ],
    });
    const itemsJson = row[5];
    const items = JSON.parse(itemsJson);
    expect(items.every((item) => item.service_name !== "Discount")).toBe(true);
    expect(sumProductLineTotals(items)).toBe(200);
  });
});

describe("reports and payments use header money", () => {
  it("tax summary uses stored total and taxable identity, not subtotal + tax", () => {
    const summary = TaxService.getTaxSummaryFromInvoices([
      {
        subtotal: 200,
        discount_amount: 20,
        tax_amount: 27,
        total_amount: 207,
        tax_rate: 15,
      },
    ]);
    expect(summary.totalBeforeTax).toBe(180);
    expect(summary.totalTax).toBe(27);
    expect(summary.totalAfterTax).toBe(207);
  });

  it("leaves historical post-discount subtotals alone in reports", () => {
    expect(
      storedTaxableAmount({
        subtotal: 80,
        discount_amount: 20,
        tax_amount: 12,
        total_amount: 92,
      })
    ).toBe(80);
  });

  it("payment balance uses stored grand total", () => {
    const balance = getInvoiceRemainingBalance(
      {
        subtotal: 200,
        discount_amount: 20,
        tax_amount: 27,
        total_amount: 207,
      },
      [{ amount: 50 }]
    );
    expect(balance.total).toBe(207);
    expect(balance.totalPaid).toBe(50);
    expect(balance.remaining).toBe(157);
  });
});
