/**
 * Product Import — PDF extraction on real PDFs (generated with pdfkit, read with pdf.js exactly as the
 * browser does, minus the worker). Covers catalogue tables, repeated headers across pages, two tables,
 * wrapped descriptions, messy / headerless layouts, pipe-separated lines and scanned (image-only) PDFs.
 */
import PDFDocument from "pdfkit";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { extractPdfProductTable, looksScanned } from "@/lib/productImport/pdfTable.js";
import { openPdf, readPdfTextPages, PdfReadError } from "@/lib/productImport/pdfReader.js";
import { buildImportRows, suggestColumnMapping, validateImportRow } from "@shared/catalog/productImport.js";

function makePdf(draw) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    });
    doc.font("Helvetica").fontSize(10);
    draw(doc);
    doc.end();
  });
}

/** Draw a row of cells at fixed x positions; `align: right` for numbers like a real price list. */
function row(doc, y, cells) {
  for (const [text, x, width, align] of cells) doc.text(String(text), x, y, { width, align: align || "left", lineBreak: false });
}

async function extract(buffer) {
  const doc = await openPdf(pdfjs, buffer);
  const { pages, pageCount } = await readPdfTextPages(pdfjs, doc);
  const result = extractPdfProductTable(pages);
  await doc.destroy();
  return { ...result, pageCount };
}

function toProducts(table) {
  const { mapping } = suggestColumnMapping(table.headers);
  return buildImportRows(table, mapping).map((r) => ({ ...validateImportRow(r.raw), meta: r.meta }));
}

const COLS = { sku: 40, name: 110, cat: 290, price: 380, stock: 470 };
function catalogueHeader(doc, y) {
  row(doc, y, [
    ["SKU", COLS.sku, 60],
    ["Product Name", COLS.name, 170],
    ["Category", COLS.cat, 80],
    ["Selling Price", COLS.price, 70, "right"],
    ["Stock", COLS.stock, 50, "right"],
  ]);
}
function catalogueRow(doc, y, [sku, name, cat, price, stock]) {
  row(doc, y, [
    [sku, COLS.sku, 60],
    [name, COLS.name, 170],
    [cat, COLS.cat, 80],
    [price, COLS.price, 70, "right"],
    [stock, COLS.stock, 50, "right"],
  ]);
}

describe("PDF product tables", () => {
  it("reads a text-based price list with headings (South African prices)", async () => {
    const buf = await makePdf((doc) => {
      doc.fontSize(16).text("Spaza Wholesale — Price List", 40, 40).fontSize(10);
      catalogueHeader(doc, 90);
      catalogueRow(doc, 110, ["COKE330", "Coca Cola 330ml", "Beverages", "R12.00", "50"]);
      catalogueRow(doc, 126, ["COF001", "Coffee Beans 1kg", "Coffee", "R185.00", "20"]);
      catalogueRow(doc, 142, ["BRD700", "White Bread 700g", "Bakery", "R1 250,00", "5"]);
    });
    const { table, textChars, pageCount } = await extract(buf);
    expect(looksScanned(textChars, pageCount)).toBe(false);
    expect(table.headers).toEqual(["SKU", "Product Name", "Category", "Selling Price", "Stock"]);
    const products = toProducts(table);
    expect(products.map((p) => p.value)).toMatchObject([
      { sku: "COKE330", name: "Coca Cola 330ml", category: "Beverages", price: 12, stock: 50 },
      { sku: "COF001", name: "Coffee Beans 1kg", category: "Coffee", price: 185, stock: 20 },
      { sku: "BRD700", name: "White Bread 700g", category: "Bakery", price: 1250, stock: 5 },
    ]);
    expect(products.every((p) => p.errors.length === 0)).toBe(true);
  });

  it("continues one table across pages with a repeated header and skips page footers", async () => {
    const buf = await makePdf((doc) => {
      catalogueHeader(doc, 60);
      for (let i = 0; i < 3; i++) catalogueRow(doc, 80 + i * 16, [`A00${i}`, `Item ${i}`, "Snacks", "R5.00", "10"]);
      doc.text("Page 1 of 2", 260, 800, { lineBreak: false });
      doc.addPage();
      catalogueHeader(doc, 60);
      for (let i = 3; i < 5; i++) catalogueRow(doc, 80 + (i - 3) * 16, [`A00${i}`, `Item ${i}`, "Snacks", "R5.00", "10"]);
    });
    const { table } = await extract(buf);
    expect(table.tableCount).toBe(1);
    expect(table.rows.map((r) => r[0])).toEqual(["A000", "A001", "A002", "A003", "A004"]);
    expect(table.rowMeta.map((m) => m.page)).toEqual([1, 1, 1, 2, 2]);
  });

  it("combines two tables with different column orders", async () => {
    const buf = await makePdf((doc) => {
      doc.text("Beverages", 40, 40);
      catalogueHeader(doc, 60);
      catalogueRow(doc, 80, ["COKE330", "Coca Cola 330ml", "Beverages", "R12.00", "50"]);
      doc.text("Groceries", 40, 200);
      row(doc, 220, [
        ["Item Description", 40, 170],
        ["Code", 230, 60],
        ["Qty", 300, 40, "right"],
        ["Retail", 360, 70, "right"],
      ]);
      row(doc, 240, [
        ["Maize Meal 5kg", 40, 170],
        ["MM5", 230, 60],
        ["12", 300, 40, "right"],
        ["R89.99", 360, 70, "right"],
      ]);
    });
    const { table } = await extract(buf);
    expect(table.tableCount).toBe(2);
    const { mapping } = suggestColumnMapping(table.headers);
    // Both tables' name / code / price / stock columns reach the same Paidly fields once mapped by the person.
    expect(mapping[table.headers.indexOf("Product Name")]).toBe("name");
    expect(mapping[table.headers.indexOf("Selling Price")]).toBe("price");
    // Columns are merged by meaning, so both tables' rows become complete products.
    expect(table.headers).toEqual(["SKU", "Product Name", "Category", "Selling Price", "Stock"]);
    expect(toProducts(table).map((p) => p.value)).toMatchObject([
      { sku: "COKE330", name: "Coca Cola 330ml", price: 12, stock: 50 },
      { sku: "MM5", name: "Maize Meal 5kg", price: 89.99, stock: 12 },
    ]);
    expect(table.rowMeta.map((m) => m.table)).toEqual([1, 2]);
  });

  it("joins a wrapped description onto its row", async () => {
    const buf = await makePdf((doc) => {
      catalogueHeader(doc, 60);
      catalogueRow(doc, 80, ["TEA100", "Rooibos Tea 100 bags", "Tea", "R45.00", "30"]);
      row(doc, 92, [["(caffeine free, organic)", COLS.name, 170]]);
      catalogueRow(doc, 108, ["SUG2", "Sugar 2kg", "Pantry", "R39.00", "40"]);
    });
    const { table } = await extract(buf);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][1]).toBe("Rooibos Tea 100 bags (caffeine free, organic)");
  });

  it("guesses columns for a headerless list and marks it uncertain", async () => {
    const buf = await makePdf((doc) => {
      doc.text("Our current stock", 40, 40);
      const lines = [
        ["ABC001", "Coca Cola 330ml", "Beverages", "R12.00", "50"],
        ["ABC002", "Fanta Orange 330ml", "Beverages", "R11.50", "35"],
        ["ABC003", "Simba Chips 125g", "Snacks", "R18.99", "22"],
      ];
      lines.forEach((l, i) => catalogueRow(doc, 70 + i * 16, l));
    });
    const { table } = await extract(buf);
    expect(table.uncertain).toBe(true);
    expect(table.headers).toEqual(["SKU", "Product Name", "Category", "Selling Price", "Stock"]);
    const products = toProducts(table);
    expect(products[0].value).toMatchObject({ sku: "ABC001", name: "Coca Cola 330ml", category: "Beverages", price: 12, stock: 50 });
    expect(table.rowMeta.every((m) => m.uncertain)).toBe(true);
  });

  it("splits pipe-separated product lines", async () => {
    const buf = await makePdf((doc) => {
      doc.text("ABC001 | Coca Cola 330ml | Beverages | R12.00 | 50", 40, 60, { lineBreak: false });
      doc.text("ABC002 | Coffee Beans 1kg | Coffee | R185.00 | 20", 40, 76, { lineBreak: false });
    });
    const { table } = await extract(buf);
    const products = toProducts(table);
    expect(products.map((p) => p.value)).toMatchObject([
      { sku: "ABC001", name: "Coca Cola 330ml", category: "Beverages", price: 12, stock: 50 },
      { sku: "ABC002", name: "Coffee Beans 1kg", category: "Coffee", price: 185, stock: 20 },
    ]);
  });

  it("flags messy rows where two values land in one column", async () => {
    const buf = await makePdf((doc) => {
      catalogueHeader(doc, 60);
      catalogueRow(doc, 80, ["COKE330", "Coca Cola 330ml", "Beverages", "R12.00", "50"]);
      // Category text drifts into the price column.
      row(doc, 96, [
        ["COF001", COLS.sku, 60],
        ["Coffee Beans 1kg", COLS.name, 170],
        ["Hot drinks", COLS.cat + 70, 60],
        ["R185.00", COLS.price, 70, "right"],
        ["20", COLS.stock, 50, "right"],
      ]);
    });
    const { table } = await extract(buf);
    expect(table.rowMeta[0].messy).toBe(false);
    expect(table.rowMeta[1].messy).toBe(true);
    // The drifted text goes back to the empty Category column; the price survives.
    expect(table.rows[1].slice(2, 4)).toEqual(["Hot drinks", "R185.00"]);
  });

  it("returns no table for a PDF of prose", async () => {
    const buf = await makePdf((doc) => {
      doc.text("Dear customer, thank you for your order. We will deliver on Tuesday between 9 and 12. Kind regards, the team.", 40, 60, { width: 500 });
    });
    const { table, textChars, pageCount } = await extract(buf);
    expect(looksScanned(textChars, pageCount)).toBe(false);
    expect(table).toBeNull();
  });

  it("detects a scanned (image-only) PDF", async () => {
    const buf = await makePdf((doc) => {
      doc.rect(40, 40, 500, 700).fill("#dddddd");
    });
    const { textChars, pageCount, table } = await extract(buf);
    expect(looksScanned(textChars, pageCount)).toBe(true);
    expect(table).toBeNull();
  });

  it("rejects a corrupt PDF with a readable message", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf").buffer;
    await expect(openPdf(pdfjs, bytes)).rejects.toBeInstanceOf(PdfReadError);
  });
});
