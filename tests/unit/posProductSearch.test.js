import { describe, it, expect } from "vitest";
import {
  buildPosCodeIndex,
  filterPosProducts,
  isPosScanQuery,
  listPosCatalogCategories,
  lookupPosProductByBarcode,
  lookupPosProductByCode,
  lookupPosProductBySku,
  normalizePosCode,
} from "../../src/lib/pos/posProductSearch.js";
import { createPosWedgeBuffer } from "../../src/lib/pos/posWedgeScan.js";
import { activeProductHasBarcode, generatePosProductBarcode } from "../../src/lib/pos/posBarcode.js";
import { addPosCartLine } from "../../src/lib/pos/posCart.js";

function item(overrides = {}) {
  return {
    id: "1",
    name: "Cola 500ml",
    sku: "DRK-001",
    barcode: "6001234567890",
    category: "Drinks",
    stock_quantity: 10,
    price: 25,
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

  it("normalizes codes by trimming and removing spaces without Number()", () => {
    expect(normalizePosCode("  600 123  ")).toBe("600123");
    expect(normalizePosCode("0123456789")).toBe("0123456789");
    expect(normalizePosCode(String(123456789))).toBe("123456789");
  });

  it("looks up barcode before SKU", () => {
    const clash = item({
      id: "sku-clash",
      name: "Other",
      sku: "6001234567890",
      barcode: "9999999999999",
    });
    const mixed = buildPosCodeIndex([clash, cola]);
    expect(lookupPosProductByBarcode(mixed, "6001234567890").id).toBe("1");
    expect(lookupPosProductByCode(mixed, "6001234567890").id).toBe("1");
    expect(lookupPosProductBySku(mixed, "DRK-001").id).toBe("1");
  });

  it("keeps leading-zero barcodes distinct", () => {
    const padded = item({ id: "z", barcode: "0123456789012", sku: "Z1" });
    const stripped = item({ id: "n", barcode: "123456789012", sku: "N1" });
    const idx = buildPosCodeIndex([padded, stripped]);
    expect(lookupPosProductByCode(idx, "0123456789012").id).toBe("z");
    expect(lookupPosProductByCode(idx, "123456789012").id).toBe("n");
  });

  it("looks up alphanumeric SKU / Code 128 values as strings", () => {
    expect(lookupPosProductByCode(index, "DRK-001").id).toBe("1");
    expect(lookupPosProductByCode(index, "bread9").id).toBe("2");
  });

  it("ranks exact code above name contains", () => {
    const rows = filterPosProducts(catalog, { query: "BRD-9", codeIndex: index });
    expect(rows[0].id).toBe("2");
  });

  it("returns only the exact barcode match", () => {
    const rows = filterPosProducts(catalog, { query: "6001234567890", codeIndex: index });
    expect(rows.map((r) => r.id)).toEqual(["1"]);
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

  it("treats compact codes as scan queries and leaves name search alone", () => {
    expect(isPosScanQuery("6001234567890")).toBe(true);
    expect(isPosScanQuery("ABC123XY")).toBe(true);
    expect(isPosScanQuery("DRK-001")).toBe(true);
    expect(isPosScanQuery("cola 500")).toBe(false);
    expect(isPosScanQuery("pads")).toBe(false);
    expect(isPosScanQuery("ab")).toBe(false);
  });
});

describe("posWedgeScan", () => {
  it("commits a rapid burst followed by Enter as one barcode string", () => {
    const wedge = createPosWedgeBuffer();
    const t0 = 1_000;
    for (const ch of "0123456789012") wedge.push(ch, t0);
    expect(wedge.push("Enter", t0 + 10)).toBe("0123456789012");
  });

  it("resets after a pause so slow typing is not a scan burst", () => {
    const wedge = createPosWedgeBuffer({ resetMs: 50 });
    wedge.push("6", 1000);
    expect(wedge.push("Enter", 1100)).toBeNull();
  });
});

describe("posBarcode uniqueness and cart scan", () => {
  it("generates a 13-character string barcode", () => {
    const code = generatePosProductBarcode();
    expect(typeof code).toBe("string");
    expect(code).toHaveLength(13);
    expect(/^\d+$/.test(code)).toBe(true);
  });

  it("flags a duplicate active barcode in the same catalog", () => {
    const rows = [item({ id: "a", barcode: "6001234567890" })];
    expect(activeProductHasBarcode(rows, "6001234567890")).toBe(true);
    expect(activeProductHasBarcode(rows, "6001234567890", { excludeId: "a" })).toBe(false);
    expect(activeProductHasBarcode(rows, "0000000000000")).toBe(false);
  });

  it("increments the same cart line on a second scan and refuses oversell", () => {
    const product = item({ stock_quantity: 3 });
    let { cart } = addPosCartLine([], product, 1);
    cart = addPosCartLine(cart, product, 1).cart;
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    const blocked = addPosCartLine(cart, product, 2);
    expect(blocked.error).toBe("INSUFFICIENT_STOCK");
    expect(blocked.stock).toBe(3);
    expect(blocked.cart[0].quantity).toBe(2);
  });
});
