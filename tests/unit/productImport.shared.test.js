/**
 * Product Import — shared engine (browser + server): column mapping, South African money / VAT / stock
 * normalisation, validation and duplicate classification.
 */
import { describe, expect, it } from "vitest";
import {
  IGNORE_COLUMN,
  buildImportRows,
  catalogColumnsForImport,
  classifyDuplicate,
  cleanImportText,
  isValidGtin,
  markInFileDuplicates,
  normalizeImportBarcode,
  normalizeImportUnit,
  parseImportMoney,
  parseImportStock,
  parseImportVat,
  rowStatus,
  suggestColumnMapping,
  validateImportRow,
} from "../../shared/catalog/productImport.js";

describe("price normalisation", () => {
  it.each([
    ["R1,250.00", 1250],
    ["R 1 250,00", 1250],
    ["1 250.00", 1250],
    ["1250", 1250],
    ["R12.00", 12],
    ["ZAR 185", 185],
    ["R 1 250,50", 1250.5],
    ["12,50", 12.5],
    ["1.250.000", 1250000],
    [" 99.99 ", 99.99],
    [1250, 1250],
    [12.345, 12.35],
  ])("%s → %s", (input, out) => expect(parseImportMoney(input)).toBe(out));

  it.each(["POA", "", "TBC", "12 x 330ml", "R", "1,2,3", null])("%s is not a price", (input) => expect(parseImportMoney(input)).toBeNull());

  it("negative amounts parse as negative (validation rejects them)", () => {
    expect(parseImportMoney("(12.00)")).toBe(-12);
    expect(parseImportMoney("-5")).toBe(-5);
  });
});

describe("VAT normalisation", () => {
  it.each([
    ["15%", 15, "standard"],
    ["15", 15, "standard"],
    ["VAT 15%", 15, "standard"],
    ["0.15", 15, "standard"],
    [0.15, 15, "standard"],
    ["0", 0, "zero"],
    ["0%", 0, "zero"],
    ["Zero rated", 0, "zero"],
    ["exempt", null, "exempt"],
    ["Standard", 15, "standard"],
  ])("%s → %s%% (%s)", (input, rate, category) => {
    const r = parseImportVat(input);
    expect(r).toMatchObject({ ok: true, rate, category });
  });

  it("other rates are kept but explained", () => {
    expect(parseImportVat("14%")).toMatchObject({ ok: true, category: "reduced" });
    expect(parseImportVat("14%").note).toMatch(/Reduced/);
    expect(parseImportVat("20").note).toMatch(/Standard/);
  });

  it("blank and n/a mean not provided; nonsense is invalid", () => {
    expect(parseImportVat("")).toMatchObject({ ok: true, empty: true });
    expect(parseImportVat("n/a")).toMatchObject({ ok: true, empty: true });
    expect(parseImportVat("abc").ok).toBe(false);
    expect(parseImportVat("150%").ok).toBe(false);
    expect(parseImportVat("-15").ok).toBe(false);
  });

  it("uses the business's standard rate when given", () => {
    expect(parseImportVat("16%", { standardRate: 16 })).toMatchObject({ category: "standard" });
  });
});

describe("stock normalisation", () => {
  it.each([
    ["10 units", 10],
    ["10", 10],
    ["Qty: 10", 10],
    ["1,000", 1000],
    ["1 000", 1000],
    ["2.5", 2.5],
    [7, 7],
  ])("%s → %s", (input, out) => expect(parseImportStock(input)).toBe(out));

  it.each(["ten", "10 x 2", ""])("%s is not a quantity", (input) => expect(parseImportStock(input)).toBeNull());
});

describe("barcodes, units, text", () => {
  it("validates GTIN check digits", () => {
    expect(isValidGtin("5449000000996")).toBe(true);
    expect(isValidGtin("5449000000997")).toBe(false);
    expect(normalizeImportBarcode("5449000000997").warning).toMatch(/check digit/);
    expect(normalizeImportBarcode("6001 2345 67892").barcode).toBe("6001234567892");
    expect(normalizeImportBarcode("CUSTOM-01").barcode).toBe("CUSTOM-01");
  });

  it("explains barcodes Excel turned into scientific notation", () => {
    expect(normalizeImportBarcode("6.00123E+12").error).toMatch(/Excel/);
    expect(normalizeImportBarcode(1e21).error).toMatch(/Excel/);
    expect(normalizeImportBarcode("abc def<>").error).toBeTruthy();
  });

  it("maps units to Paidly count styles", () => {
    expect(normalizeImportUnit("EA").unit).toBe("unit");
    expect(normalizeImportUnit("Ctn").unit).toBe("case");
    expect(normalizeImportUnit("kg")).toMatchObject({ unit: "unit", note: expect.stringMatching(/count style/) });
    expect(normalizeImportUnit("Hour", "service").unit).toBe("hour");
  });

  it("removes HTML and control characters but keeps the text", () => {
    expect(cleanImportText("<script>alert(1)</script>Coke\u0000 330ml")).toMatchObject({ text: "alert(1) Coke 330ml", strippedHtml: true });
    expect(cleanImportText("Cable <5m>").text).toBe("Cable <5m>");
    expect(cleanImportText("=HYPERLINK(\"http://x\")").formulaLike).toBe(true);
    expect(cleanImportText("Coca Cola 330ml").text).toBe("Coca Cola 330ml");
  });
});

describe("column mapping", () => {
  it("maps the standard layout with high confidence", () => {
    const r = suggestColumnMapping(["Product Name", "SKU", "Description", "Category", "Price", "Cost", "Stock", "VAT"]);
    expect(r.mapping).toEqual(["name", "sku", "description", "category", "price", "cost_price", "stock", "vat"]);
    expect(r.confidence.every((c) => c === "high")).toBe(true);
  });

  it("doesn't assume a column order and understands common synonyms", () => {
    const r = suggestColumnMapping(["Qty", "Selling Price", "Item Code", "Product", "EAN", "UOM", "Manufacturer", "Buying Price"]);
    expect(r.mapping).toEqual(["stock", "price", "sku", "name", "barcode", "unit", "brand", "cost_price"]);
  });

  it("uses Description as the name when there is no name column, and asks to check it", () => {
    const r = suggestColumnMapping(["SKU", "Description", "Qty", "Selling Price"]);
    expect(r.mapping).toEqual(["sku", "name", "stock", "price"]);
    expect(r.confidence[1]).toBe("medium");
  });

  it("uses fuzzy matching for typos", () => {
    expect(suggestColumnMapping(["Prodcut Name", "Sellling Price"]).mapping).toEqual(["name", "price"]);
  });

  it("doesn't blindly map ambiguous columns", () => {
    const r = suggestColumnMapping(["Item Description", "Code", "Retail", "Qty Available", "Price Incl VAT"]);
    expect(r.mapping[4]).toBe(IGNORE_COLUMN); // not VAT, and Selling Price is taken
    expect(r.notes[4]).toMatch(/Selling Price/);
    expect(r.confidence[1]).toBe("medium"); // "Code" is weak evidence
  });

  it("prefers VAT-exclusive prices and warns on inclusive ones", () => {
    expect(suggestColumnMapping(["Unit Price", "Price Excl VAT", "Price Incl VAT"]).mapping).toEqual([IGNORE_COLUMN, "price", IGNORE_COLUMN]);
    const incl = suggestColumnMapping(["Name", "Price Incl VAT"]);
    expect(incl.notes[1]).toMatch(/VAT-inclusive/);
  });

  it("drops product-only fields for services", () => {
    expect(suggestColumnMapping(["Name", "Stock", "Barcode"], { itemType: "service" }).mapping).toEqual(["name", IGNORE_COLUMN, IGNORE_COLUMN]);
  });
});

describe("rows and validation", () => {
  const table = {
    headers: ["Product Name", "SKU", "Selling Price", "VAT", "Stock"],
    rows: [
      ["Coca Cola 330ml", "COKE330", "R12.00", "15%", "50"],
      ["", "", "", "", ""],
      ["Product Name", "SKU", "Selling Price", "VAT", "Stock"],
      ["Coffee Beans 1kg", "COF001", "R185.00", "15%", "20"],
    ],
  };

  it("applies the mapping, skipping blank and repeated header rows", () => {
    const rows = buildImportRows(table, ["name", "sku", "price", "vat", "stock"]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 5]);
    expect(rows[0].raw).toEqual({ name: "Coca Cola 330ml", sku: "COKE330", price: "R12.00", vat: "15%", stock: "50" });
  });

  it("the South African examples are ready to import", () => {
    const [coke, coffee] = buildImportRows(table, ["name", "sku", "price", "vat", "stock"]).map((r) => validateImportRow(r.raw));
    expect(coke.value).toMatchObject({ name: "Coca Cola 330ml", sku: "COKE330", price: 12, vat_rate: 15, tax_category: "standard", stock: 50 });
    expect(coffee.value).toMatchObject({ name: "Coffee Beans 1kg", sku: "COF001", price: 185, stock: 20 });
    expect(coke.errors).toEqual([]);
    expect(rowStatus(coke, false)).toBe("ready");
  });

  it("reports missing and invalid fields with a suggested fix", () => {
    const r = validateImportRow({ price: "abc", stock: "-1", vat: "x", barcode: "not valid!" });
    const messages = r.errors.map((e) => e.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Product name is missing.",
        "Selling price must be a number.",
        "Stock can't be negative.",
        "VAT must be a percentage like 15%, 0 or exempt.",
        "Barcode can only contain letters, numbers, dashes and dots.",
      ])
    );
    expect(r.errors.every((e) => e.fix)).toBe(true);
    expect(rowStatus(r, true)).toBe("error");
  });

  it("warns without blocking", () => {
    const r = validateImportRow({ name: "Chips", price: "10", cost_price: "12" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.message)).toContain("Cost price is higher than the selling price.");
    expect(rowStatus(r, false)).toBe("warning");
    expect(validateImportRow({ name: "No price" }).warnings[0].message).toMatch(/No selling price/);
  });

  it("flags totals lines", () => {
    expect(validateImportRow({ name: "Sub-total", price: "1000" }).errors[0].message).toMatch(/totals line/);
  });

  it("rejects over-long values", () => {
    expect(validateImportRow({ name: "x".repeat(201) }).errors[0].message).toMatch(/too long/);
  });
});

describe("duplicates", () => {
  const existing = [
    { id: "1", name: "Coca Cola 330ml", sku: "COKE330", barcode: "5449000000996", item_type: "product" },
    { id: "2", name: "Coffee Beans 1kg", sku: null, barcode: null, item_type: "product" },
  ];

  it("matches by SKU first, then barcode, then name", () => {
    expect(classifyDuplicate({ sku: "coke330", name: "Coffee Beans 1kg" }, existing)).toMatchObject({ matchedBy: "sku", match: { id: "1" } });
    expect(classifyDuplicate({ barcode: "5449000000996" }, existing)).toMatchObject({ matchedBy: "barcode" });
    expect(classifyDuplicate({ name: " coffee  beans 1KG" }, existing)).toMatchObject({ matchedBy: "name", match: { id: "2" } });
    expect(classifyDuplicate({ sku: "NEW", name: "New thing" }, existing)).toBeNull();
  });

  it("finds duplicates inside the file", () => {
    const d = markInFileDuplicates([
      { rowNumber: 2, value: { name: "A", sku: "S1", barcode: "111" } },
      { rowNumber: 3, value: { name: "B", sku: "s1", barcode: null } },
      { rowNumber: 4, value: { name: "C", sku: null, barcode: "111" } },
      { rowNumber: 5, value: { name: "a", sku: null, barcode: null } },
    ]);
    expect(d.get(1)).toEqual({ kind: "sku", firstRow: 2 });
    expect(d.get(2)).toEqual({ kind: "barcode", firstRow: 2 });
    expect(d.get(3)).toEqual({ kind: "name", firstRow: 2 });
  });

  it("updates carry only provided fields", () => {
    const v = validateImportRow({ name: "Coke", price: "12", description: "" });
    const cols = catalogColumnsForImport(v.value, { itemType: "product", provided: v.provided, onlyProvided: true });
    expect(cols).toEqual({ name: "Coke", price: 12, default_rate: 12, rate: 12, unit_price: 12 });
  });
});
