/**
 * Product Import — files Paidly hands out: the Excel / CSV templates and the error report.
 */
import { PRODUCT_TEMPLATE_EXAMPLE_ROWS, PRODUCT_TEMPLATE_HEADERS } from "@shared/catalog/productImport.js";

/** A spreadsheet opening this CSV must never run a cell as a formula. */
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  // BOM so Excel opens UTF-8 (R, é, ’) correctly.
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function productTemplateCsv() {
  return toCsv([PRODUCT_TEMPLATE_HEADERS, ...PRODUCT_TEMPLATE_EXAMPLE_ROWS]);
}

export function downloadCsvTemplate() {
  downloadBlob(new Blob([productTemplateCsv()], { type: "text/csv;charset=utf-8" }), "paidly-product-import-template.csv");
}

export async function downloadExcelTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([PRODUCT_TEMPLATE_HEADERS, ...PRODUCT_TEMPLATE_EXAMPLE_ROWS]);
  ws["!cols"] = PRODUCT_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  // SKU and Barcode as text so Excel keeps leading zeros and long barcodes intact.
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (const col of [PRODUCT_TEMPLATE_HEADERS.indexOf("SKU"), PRODUCT_TEMPLATE_HEADERS.indexOf("Barcode")]) {
    for (let r = range.s.r + 1; r <= range.e.r + 200; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: col });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].z = "@";
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r + 200, c: range.e.c } });
  const notes = XLSX.utils.aoa_to_sheet([
    ["How to use this template"],
    ["Replace the two example rows with your products (they are examples only — delete them)."],
    ["Only Product Name is required. Leave other cells blank if you don't have the value."],
    ["Prices: numbers like 12.00 or R12.00. Selling prices exclude VAT."],
    ["VAT: 15%, 0% or exempt."],
    ["Stock Quantity: the number you have on hand now."],
    ["Unit: unit, case, pack, box, pallet, bottle, bag or roll."],
  ]);
  notes["!cols"] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");
  XLSX.writeFile(wb, "paidly-product-import-template.xlsx");
}

/** @param {Array<{ row: number, product: string, reason: string, fix: string }>} rows */
export function errorReportCsv(rows) {
  return toCsv([["Row", "Product", "Reason", "Suggested Fix"], ...rows.map((r) => [r.row, r.product, r.reason, r.fix])]);
}

export function downloadErrorReport(rows, sourceName = "") {
  const base = String(sourceName || "import").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "import";
  downloadBlob(new Blob([errorReportCsv(rows)], { type: "text/csv;charset=utf-8" }), `${base}-import-errors.csv`);
}
