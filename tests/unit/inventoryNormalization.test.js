import { describe, expect, it } from "vitest";
import { normalizeCatalogTableRow, normalizeInventoryProductRow, toQuantity } from "@/utils/inventoryNormalization";

describe("toQuantity", () => {
  it("keeps fractional stock such as 1.25 instead of truncating to 1", () => {
    expect(toQuantity(1.25)).toBe(1.25);
    expect(toQuantity("1.25")).toBe(1.25);
    expect(toQuantity(1.256)).toBe(1.26);
  });
});

describe("normalizeInventoryProductRow", () => {
  it("includes barcode, image_url, cost, and stock_capacity", () => {
    const row = normalizeInventoryProductRow({
      id: "p1",
      name: "Body butter",
      sku: "SU-3206",
      barcode: "6001234567890",
      image_url: "inventory/u1/abc.png",
      stock_quantity: 51,
      stock_capacity: 100,
      low_stock_threshold: 10,
      cost_price: 24,
      price: 35,
      default_unit: "units",
    });
    expect(row).toMatchObject({
      barcode: "6001234567890",
      image_url: "inventory/u1/abc.png",
      stock_on_hand: 51,
      stock_capacity: 100,
      cost: 24,
      price: 35,
    });
    expect(row.company_id).toBeNull();
  });

  it("shows a service selling price from default_rate", () => {
    const row = normalizeCatalogTableRow({
      id: "s1",
      name: "Brand Guide Design",
      item_type: "service",
      default_rate: 3000,
      price: 0,
      cost_rate: 0,
    });
    expect(row.item_type).toBe("service");
    expect(row.price).toBe(3000);
  });

  it("uses the product price column when a service rate was stored there", () => {
    const row = normalizeCatalogTableRow({
      id: "s2",
      name: "Label Design",
      item_type: "service",
      default_rate: 0,
      price: 1200,
    });
    expect(row.price).toBe(1200);
  });

  it("keeps brand ownership for POS scoping", () => {
    const row = normalizeInventoryProductRow({
      id: "p2",
      name: "Private tea",
      company_id: "brand-a",
      stock_quantity: 3,
      price: 12,
    });
    expect(row.company_id).toBe("brand-a");
  });
});
