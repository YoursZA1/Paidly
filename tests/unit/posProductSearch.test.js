import { describe, it, expect } from "vitest";
import {
  buildPosCodeIndex,
  filterPosProducts,
  isPosScanQuery,
  listPosCatalogCategories,
  lookupPosProductByCode,
  normalizePosCode,
} from "../../src/lib/pos/posProductSearch.js";

function item(overrides = {}) {
  return {
    id: "1",
    name: "Cola 500ml",
    sku: "DRK-001",
    barcode: "6001234567890",
    category: "Drinks",
    ...overrides,
  };
}

describe("posProductSearch", () => {
  const cola = item();
  const bread = item({
    id: "2",
    name: "Brown Bread",
    sku: "BRD-9",
    barcode: "6009990001112",
    category: "Food",
    product_code: "BREAD9",
  });
  const catalog = [cola, bread];
  const index = buildPosCodeIndex(catalog);

  it("normalizes codes by trimming and removing spaces", () => {
    expect(normalizePosCode("  600 123  ")).toBe("600123");
  });

  it("looks up by barcode, sku, and product_code", () => {
    expect(lookupPosProductByCode(index, "6001234567890").id).toBe("1");
    expect(lookupPosProductByCode(index, "DRK-001").id).toBe("1");
    expect(lookupPosProductByCode(index, "bread9").id).toBe("2");
  });

  it("ranks exact code above name contains", () => {
    const rows = filterPosProducts(catalog, { query: "BRD-9", codeIndex: index });
    expect(rows[0].id).toBe("2");
  });

  it("filters by product name without requiring the full name", () => {
    const rows = filterPosProducts(catalog, { query: "cola", codeIndex: index });
    expect(rows.map((r) => r.id)).toEqual(["1"]);
  });

  it("does not treat category chips as text search", () => {
    const rows = filterPosProducts(catalog, { query: "Drinks", codeIndex: index });
    expect(rows).toHaveLength(0);
  });

  it("respects category while searching", () => {
    const rows = filterPosProducts(catalog, {
      query: "b",
      category: "Food",
      codeIndex: index,
    });
    expect(rows.map((r) => r.id)).toEqual(["2"]);
  });

  it("lists catalog categories from services.category with counts", () => {
    const extra = item({ id: "3", name: "Juice", sku: "J1", barcode: "1", category: "Drinks" });
    const rows = listPosCatalogCategories([cola, bread, extra, item({ id: "4", name: "Loose", sku: "L", barcode: "2", category: "  " })]);
    expect(rows).toEqual([
      { name: "Drinks", count: 2 },
      { name: "Food", count: 1 },
    ]);
  });

  it("treats compact codes as scan queries", () => {
    expect(isPosScanQuery("6001234567890")).toBe(true);
    expect(isPosScanQuery("cola 500")).toBe(false);
    expect(isPosScanQuery("ab")).toBe(false);
  });
});
