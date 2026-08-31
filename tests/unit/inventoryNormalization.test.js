import { describe, expect, it } from "vitest";
import { normalizeInventoryProductRow } from "@/utils/inventoryNormalization";

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
