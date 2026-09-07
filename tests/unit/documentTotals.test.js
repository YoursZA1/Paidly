import { describe, expect, it } from "vitest";
import {
  aggregateFromItems,
  isLegacyDiscountLine,
  toCommercialItemRow,
} from "@/document-engine/documentTotals";

describe("aggregateFromItems", () => {
  it("computes zero tax", () => {
    const result = aggregateFromItems(
      [{ quantity: 2, unit_price: 50, service_name: "Design" }],
      0,
      0
    );
    expect(result.subtotal).toBe(100);
    expect(result.tax_amount).toBe(0);
    expect(result.total_amount).toBe(100);
    expect(result.discount_amount).toBe(0);
  });

  it("applies a percentage header discount", () => {
    const result = aggregateFromItems(
      [{ quantity: 1, unit_price: 200, service_name: "Design" }],
      15,
      10,
      "VAT_EXCLUSIVE",
      "percentage"
    );
    expect(result.subtotal).toBe(200);
    expect(result.discount_type).toBe("percentage");
    expect(result.discount_value).toBe(10);
    expect(result.discount_amount).toBe(20);
    expect(result.taxable_amount).toBe(180);
    expect(result.tax_amount).toBe(27);
    expect(result.total_amount).toBe(207);
  });

  it("taxes the amount after header discount", () => {
    const result = aggregateFromItems(
      [{ quantity: 1, unit_price: 200, service_name: "Design" }],
      15,
      20
    );
    expect(result.subtotal).toBe(200);
    expect(result.discount_amount).toBe(20);
    expect(result.tax_amount).toBe(27);
    expect(result.total_amount).toBe(207);
  });

  it("caps discount at the subtotal", () => {
    const result = aggregateFromItems(
      [{ quantity: 1, unit_price: 40, service_name: "Design" }],
      15,
      99
    );
    expect(result.discount_amount).toBe(40);
    expect(result.tax_amount).toBe(0);
    expect(result.total_amount).toBe(0);
  });

  it("recomputes line totals from qty and rate", () => {
    const result = aggregateFromItems(
      [{ quantity: 3, unit_price: 10, total_price: 999, service_name: "Hours" }],
      0,
      0
    );
    expect(result.subtotal).toBe(30);
    expect(result.rows[0].total_price).toBe(30);
  });

  it("ignores a legacy Discount line when header discount is set", () => {
    const result = aggregateFromItems(
      [
        { service_name: "Design", quantity: 1, unit_price: 200, total_price: 200 },
        { service_name: "Discount", quantity: 1, unit_price: -20, total_price: -20 },
      ],
      15,
      20
    );
    expect(result.subtotal).toBe(200);
    expect(result.discount_amount).toBe(20);
    expect(result.tax_amount).toBe(27);
    expect(result.total_amount).toBe(207);
    expect(result.rows.every((row) => row.service_name !== "Discount")).toBe(true);
  });

  it("extracts a legacy Discount line when header discount is 0", () => {
    const result = aggregateFromItems(
      [
        { service_name: "Design", quantity: 1, unit_price: 100, total_price: 100 },
        { service_name: "Discount", total_price: -5 },
      ],
      15,
      0
    );
    expect(result.subtotal).toBe(100);
    expect(result.discount_amount).toBe(5);
    expect(result.tax_amount).toBe(14.25);
    expect(result.total_amount).toBe(109.25);
  });

  it("returns zeros for empty items", () => {
    expect(aggregateFromItems([], 15, 10)).toEqual({
      rows: [],
      subtotal: 0,
      discount_type: "fixed",
      discount_value: 10,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      vat_mode: "VAT_EXCLUSIVE",
      taxable_amount: 0,
    });
  });

  it("extracts VAT from inclusive unit prices", () => {
    const result = aggregateFromItems(
      [{ quantity: 1, unit_price: 1150, service_name: "Design" }],
      15,
      0,
      "VAT_INCLUSIVE"
    );
    expect(result.subtotal).toBe(1000);
    expect(result.tax_amount).toBe(150);
    expect(result.total_amount).toBe(1150);
    expect(result.vat_mode).toBe("VAT_INCLUSIVE");
  });

  it("rounds to two decimal places", () => {
    const result = aggregateFromItems(
      [{ quantity: 1, unit_price: 10.555, service_name: "A" }],
      15,
      0
    );
    expect(result.subtotal).toBe(10.56);
    expect(result.tax_amount).toBe(1.58);
    expect(result.total_amount).toBe(12.14);
  });
});

describe("toCommercialItemRow", () => {
  it("keeps catalog fields and drops industry presets", () => {
    const row = toCommercialItemRow({
      service_id: "svc-1",
      catalog_item_id: "cat-9",
      sku: "SKU-1",
      item_type: "product",
      item_tax_rate: 15,
      service_name: "Widget",
      description: "Blue",
      quantity: 2,
      unit_price: 10,
      discount: 1,
      discount_type: "fixed",
      unit_type: "piece",
      industry_preset: "electrical",
    });
    expect(row.service_id).toBe("svc-1");
    expect(row.catalog_item_id).toBe("cat-9");
    expect(row.service_name).toBe("Widget");
    expect(row.description).toBe("Blue");
    expect(row.quantity).toBe(2);
    expect(row.unit_price).toBe(10);
    expect(row.total_price).toBe(20);
    expect(row.sku).toBe("SKU-1");
    expect(row.item_type).toBe("product");
    expect(row.tax_rate).toBe(15);
    expect(row.discount).toBe(1);
    expect(row.unit_type).toBe("piece");
    expect(row.industry_preset).toBeUndefined();
    expect(row.item_tax_rate).toBeUndefined();
  });
});

describe("isLegacyDiscountLine", () => {
  it("detects a negative Discount row", () => {
    expect(isLegacyDiscountLine({ service_name: "Discount", total_price: -25 })).toBe(true);
    expect(isLegacyDiscountLine({ service_name: "Design", total_price: -25 })).toBe(false);
  });
});
