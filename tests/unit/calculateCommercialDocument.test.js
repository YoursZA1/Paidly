import { describe, expect, it } from "vitest";
import {
  VAT_MODE,
  DISCOUNT_TYPE,
  allocateAmount,
  calculateCommercialDocument,
  commercialMoneyFields,
  documentDiscountFromRecord,
  hydrateCommercialDocument,
  isPersistenceDiscountLine,
  resolveCommercialDocumentTotals,
  roundMoney,
  splitPersistenceDiscountLines,
  toPersistableLineItems,
} from "@shared/commercial/index.js";

describe("roundMoney", () => {
  it("rounds half-up to cents", () => {
    expect(roundMoney(10.555)).toBe(10.56);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney("12.4")).toBe(12.4);
    expect(roundMoney(undefined)).toBe(0);
  });
});

describe("allocateAmount", () => {
  it("keeps the allocated total equal to the requested amount", () => {
    const shares = allocateAmount(10, [100, 100, 100]);
    expect(roundMoney(shares.reduce((sum, value) => sum + value, 0))).toBe(10);
  });
});

describe("calculateCommercialDocument", () => {
  it("calculates no discount exclusive VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 2, unitPrice: 50, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(100);
    expect(result.lineDiscountTotal).toBe(0);
    expect(result.documentDiscount).toBe(0);
    expect(result.taxableAmount).toBe(100);
    expect(result.taxTotal).toBe(15);
    expect(result.grandTotal).toBe(115);
    expect(result.paidAmount).toBe(0);
    expect(result.balanceDue).toBe(115);
  });

  it("applies a fixed line discount before VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 100, discount: 10, discountType: DISCOUNT_TYPE.FIXED, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(90);
    expect(result.lineDiscountTotal).toBe(10);
    expect(result.taxableAmount).toBe(90);
    expect(result.taxTotal).toBe(13.5);
    expect(result.grandTotal).toBe(103.5);
  });

  it("applies a percentage line discount", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 200, discount: 25, discountType: DISCOUNT_TYPE.PERCENTAGE, taxRate: 0 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.lineDiscountTotal).toBe(50);
    expect(result.subtotal).toBe(150);
    expect(result.grandTotal).toBe(150);
  });

  it("applies a document discount after line discounts, then VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 200, taxRate: 15 }],
      documentDiscount: 20,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(200);
    expect(result.documentDiscount).toBe(20);
    expect(result.taxableAmount).toBe(180);
    expect(result.taxTotal).toBe(27);
    expect(result.grandTotal).toBe(207);
  });

  it("applies a percentage document discount", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 100, taxRate: 10 }],
      documentDiscount: 10,
      documentDiscountType: DISCOUNT_TYPE.PERCENTAGE,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.documentDiscount).toBe(10);
    expect(result.taxableAmount).toBe(90);
    expect(result.taxTotal).toBe(9);
    expect(result.grandTotal).toBe(99);
  });

  it("extracts VAT from inclusive unit prices", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 115, taxRate: 15 }],
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.subtotal).toBe(100);
    expect(result.taxTotal).toBe(15);
    expect(result.grandTotal).toBe(115);
    expect(result.taxableAmount).toBe(100);
  });

  it("applies inclusive document discount to the VAT-inclusive amount", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 115, taxRate: 15 }],
      documentDiscount: 15,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.documentDiscount).toBe(15);
    expect(result.grandTotal).toBe(100);
    expect(result.taxableAmount).toBe(86.96);
    expect(result.taxTotal).toBe(13.04);
    expect(result.subtotal).toBe(100);
  });

  it("taxes mixed line rates after allocating a document discount", () => {
    const result = calculateCommercialDocument({
      lines: [
        { quantity: 1, unitPrice: 100, taxRate: 15 },
        { quantity: 1, unitPrice: 100, taxRate: 0 },
      ],
      documentDiscount: 20,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(200);
    expect(result.documentDiscount).toBe(20);
    expect(result.taxableAmount).toBe(180);
    expect(result.taxTotal).toBe(13.5);
    expect(result.grandTotal).toBe(193.5);
    expect(result.lines[0].taxable).toBe(90);
    expect(result.lines[1].taxable).toBe(90);
  });

  it("keeps zero VAT at zero", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 3, unitPrice: 10, taxRate: 0 }],
      documentDiscount: 5,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(25);
    expect(result.taxableAmount).toBe(25);
  });

  it("caps document discount at the subtotal", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 40 }],
      documentDiscount: 99,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.documentDiscount).toBe(40);
    expect(result.grandTotal).toBe(0);
    expect(result.balanceDue).toBe(0);
  });

  it("computes a partial-payment balance", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 100, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
      payments: [{ amount: 50 }],
    });
    expect(result.grandTotal).toBe(115);
    expect(result.paidAmount).toBe(50);
    expect(result.balanceDue).toBe(65);
  });

  it("treats a fully paid invoice as zero balance", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 100, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
      paidAmount: 115,
    });
    expect(result.paidAmount).toBe(115);
    expect(result.balanceDue).toBe(0);
  });

  it("does not report a negative balance when overpaid", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 10 }],
      paidAmount: 25,
    });
    expect(result.balanceDue).toBe(0);
  });
});

describe("historical discount lines", () => {
  it("detects a persistence Discount row", () => {
    expect(isPersistenceDiscountLine({ service_name: "Discount", total_price: -25 })).toBe(true);
    expect(isPersistenceDiscountLine({ service_name: "Design", total_price: -25 })).toBe(false);
  });

  it("extracts a historical Discount line as documentDiscount", () => {
    const { lines, extractedDocumentDiscount } = splitPersistenceDiscountLines([
      { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
      { service_name: "Discount", quantity: 1, unit_price: -20, total_price: -20 },
    ]);
    expect(lines).toHaveLength(1);
    expect(extractedDocumentDiscount).toBe(20);
  });

  it("hydrates stored invoices without keeping the Discount line", () => {
    const hydrated = hydrateCommercialDocument({
      items: [
        { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
        { service_name: "Discount", total_price: -20 },
      ],
      tax_rate: 15,
      subtotal: 180,
      tax_amount: 27,
      total_amount: 207,
    });
    expect(hydrated.items).toHaveLength(1);
    expect(hydrated.discount_amount).toBe(20);
    expect(hydrated.items.some((item) => item.service_name === "Discount")).toBe(false);
  });

  it("never writes a Discount line when persisting", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 80, taxRate: 0 }],
      documentDiscount: 10,
    });
    const rows = toPersistableLineItems(
      [
        { description: "Design", quantity: 1, unit_price: 80, total: 80 },
        { service_name: "Discount", total_price: -10 },
      ],
      result
    );
    expect(rows.every((row) => row.service_name !== "Discount")).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_price).toBe(80);
  });

  it("preserves stored totals on historical documents", () => {
    const resolved = resolveCommercialDocumentTotals(
      {
        items: [
          { service_name: "Design", quantity: 1, unit_price: 100, total_price: 100 },
          { service_name: "Discount", total_price: -5 },
        ],
        tax_rate: 15,
        subtotal: 95,
        tax_amount: 14.25,
        total_amount: 109.25,
      },
      { payments: [{ amount: 9.25 }] }
    );
    expect(resolved.source).toBe("stored");
    expect(resolved.grandTotal).toBe(109.25);
    expect(resolved.taxTotal).toBe(14.25);
    expect(resolved.documentDiscount).toBe(5);
    expect(resolved.paidAmount).toBe(9.25);
    expect(resolved.balanceDue).toBe(100);
  });

  it("recalculates live compose totals instead of stored fields", () => {
    const resolved = resolveCommercialDocumentTotals(
      {
        __liveTotals: true,
        line_items: [{ quantity: 1, unit_price: 100 }],
        tax_rate: 15,
        discount: 0,
        subtotal: 1,
        tax_amount: 1,
        total_amount: 1,
      },
      { recalculate: true }
    );
    expect(resolved.source).toBe("calculated");
    expect(resolved.grandTotal).toBe(115);
  });
});

describe("South African VAT 15%", () => {
  it("adds VAT on R1,000 exclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1000, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(1000);
    expect(result.taxTotal).toBe(150);
    expect(result.grandTotal).toBe(1150);
  });

  it("adds VAT on R1,150 exclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1150, taxRate: 15 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(1150);
    expect(result.taxTotal).toBe(172.5);
    expect(result.grandTotal).toBe(1322.5);
  });

  it("extracts VAT from R1,150 inclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1150, taxRate: 15 }],
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.grandTotal).toBe(1150);
    expect(result.subtotal).toBe(1000);
    expect(result.taxTotal).toBe(150);
  });

  it("extracts VAT from R575 inclusive", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 575, taxRate: 15 }],
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.grandTotal).toBe(575);
    expect(result.subtotal).toBe(500);
    expect(result.taxTotal).toBe(75);
  });

  it("sums multiple exclusive line items", () => {
    const result = calculateCommercialDocument({
      lines: [
        { quantity: 2, unitPrice: 250, taxRate: 15 },
        { quantity: 1, unitPrice: 500, taxRate: 15 },
      ],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(1000);
    expect(result.taxTotal).toBe(150);
    expect(result.grandTotal).toBe(1150);
  });

  it("applies a document discount then exclusive VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1000, taxRate: 15 }],
      documentDiscount: 100,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(1000);
    expect(result.documentDiscount).toBe(100);
    expect(result.taxableAmount).toBe(900);
    expect(result.taxTotal).toBe(135);
    expect(result.grandTotal).toBe(1035);
  });

  it("keeps a zero-rated line at zero VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1000, taxRate: 0 }],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(1000);
  });

  it("taxes mixed rates without treating the zero-rated line as standard VAT", () => {
    const result = calculateCommercialDocument({
      lines: [
        { quantity: 1, unitPrice: 1000, taxRate: 15 },
        { quantity: 1, unitPrice: 400, taxRate: 0 },
      ],
      vatMode: VAT_MODE.EXCLUSIVE,
    });
    expect(result.subtotal).toBe(1400);
    expect(result.taxTotal).toBe(150);
    expect(result.grandTotal).toBe(1550);
    expect(result.lines[0].tax).toBe(150);
    expect(result.lines[1].tax).toBe(0);
  });

  it("applies a document discount then extracts inclusive VAT", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 1150, taxRate: 15 }],
      documentDiscount: 115,
      documentDiscountType: DISCOUNT_TYPE.FIXED,
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.grandTotal).toBe(1035);
    expect(result.subtotal).toBe(1000);
    expect(result.taxableAmount).toBe(900);
    expect(result.taxTotal).toBe(135);
  });

  it("extracts mixed inclusive rates without taxing the zero-rated line", () => {
    const result = calculateCommercialDocument({
      lines: [
        { quantity: 1, unitPrice: 1150, taxRate: 15 },
        { quantity: 1, unitPrice: 400, taxRate: 0 },
      ],
      vatMode: VAT_MODE.INCLUSIVE,
    });
    expect(result.grandTotal).toBe(1550);
    expect(result.subtotal).toBe(1400);
    expect(result.taxTotal).toBe(150);
    expect(result.lines[0].tax).toBe(150);
    expect(result.lines[1].tax).toBe(0);
  });
});

describe("commercialMoneyFields", () => {
  it("maps engine output onto invoice/quote columns", () => {
    const result = calculateCommercialDocument({
      lines: [{ quantity: 1, unitPrice: 50, taxRate: 10 }],
    });
    expect(commercialMoneyFields(result)).toEqual({
      subtotal: 50,
      discount_amount: 0,
      tax_amount: 5,
      total_amount: 55,
    });
  });
});

describe("documentDiscountFromRecord", () => {
  it("infers a document discount from exclusive stored totals", () => {
    const inferred = documentDiscountFromRecord({
      subtotal: 200,
      tax_rate: 15,
      tax_amount: 27,
      total_amount: 207,
    });
    expect(inferred).toBe(20);
  });
});
