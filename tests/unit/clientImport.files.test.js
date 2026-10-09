/**
 * Client files: CSV, multi-sheet Excel, text-PDF table reconstruction, empty and rejected files.
 * Sample rows are fictional.
 */
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { ImportFileError, inspectImportFile } from "@/lib/productImport/fileDetect.js";
import { parseCsvBuffer, parseWorkbookBuffer } from "@/lib/productImport/tableParsing.js";
import { extractPdfProductTable } from "@/lib/productImport/pdfTable.js";
import {
  CLIENT_PDF_PROFILE,
  applyColumnMapping,
  clientLooksLikeHeaderRow,
  promoteClientHeader,
  suggestColumnMapping,
  validateClientImportRow,
} from "@shared/clients/clientImport.js";

const enc = (s) => new TextEncoder().encode(s).buffer;
const fileOf = (content, name, type) => new File([content], name, { type });

function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out instanceof ArrayBuffer ? out : new Uint8Array(out).buffer;
}

function clientsFrom(table) {
  const { mapping } = suggestColumnMapping(table.headers);
  return table.rows.map((cells) => validateClientImportRow(applyColumnMapping(mapping, cells)));
}

describe("csv and excel", () => {
  it("reads a valid CSV including an international name", () => {
    const csv = "Client name,Email,Phone\nJosé Muñoz,jose@example.co.za,0715550142\n";
    const table = promoteClientHeader(parseCsvBuffer(enc(csv)).sheets[0].table);
    const rows = clientsFrom(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].value.name).toBe("José Muñoz");
    expect(rows[0].value.email).toBe("jose@example.co.za");
  });

  it("lets the user pick a worksheet when the workbook has several", () => {
    const buf = workbook([
      ["Notes", [["Title"], ["Internal note, not a client"]]],
      ["Customers", [
        ["Company name", "Email", "VAT number"],
        ["Harbour School", "office@example.co.za", "4987654321"],
        ["", "", ""],
      ]],
    ]);
    const parsed = parseWorkbookBuffer(XLSX, buf);
    expect(parsed.sheets.map((s) => s.name)).toEqual(["Notes", "Customers"]);
    const table = promoteClientHeader(parsed.sheets[1].table);
    const rows = clientsFrom(table).filter((r) => !r.empty);
    expect(rows).toHaveLength(1);
    expect(rows[0].value.name).toBe("Harbour School");
    expect(rows[0].value.tax_id).toBe("4987654321");
  });

  it("rejects an empty file, a wrong type, and a file that is not really a PDF", async () => {
    await expect(inspectImportFile(fileOf("", "clients.csv", "text/csv"))).rejects.toMatchObject({ code: "EMPTY" });
    await expect(inspectImportFile(fileOf("hello", "clients.docx", "application/octet-stream"))).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(inspectImportFile(fileOf("not a pdf", "clients.pdf", "application/pdf"))).rejects.toBeInstanceOf(ImportFileError);
  });
});

describe("pdf text extraction", () => {
  function item(str, x, y) {
    return { str, x, y, w: str.length * 6, h: 10 };
  }

  const pages = [{
    pageNumber: 1,
    items: [
      item("Client name", 10, 20),
      item("Email", 180, 20),
      item("Phone", 360, 20),
      item("Thabo Nkosi", 10, 40),
      item("thabo@example.co.za", 180, 40),
      item("0825550101", 360, 40),
    ],
  }];

  it("reads a text-based client table when client headings are recognised", () => {
    const { table } = extractPdfProductTable(pages, { isHeader: clientLooksLikeHeaderRow });
    expect(table.rows).toHaveLength(1);
    expect(table.headers.map((h) => h.toLowerCase())).toEqual(["client name", "email", "phone"]);
    const row = validateClientImportRow(applyColumnMapping(suggestColumnMapping(table.headers).mapping, table.rows[0]));
    expect(row.errors).toEqual([]);
    expect(row.value.name).toBe("Thabo Nkosi");
  });

  it("never merges two clients when a cell is empty, keeps a name-only client, and joins a wrapped address", () => {
    const wide = [{
      pageNumber: 1,
      items: [
        item("Client Name", 10, 20), item("Email", 180, 20), item("Address", 420, 20), item("VAT Number", 560, 20),
        item("Riverside Primary School", 10, 40), item("office@riverside.example.co.za", 180, 40), item("1 River Road", 420, 40), item("4200000001", 560, 40),
        item("Unit 4, Cape Town", 420, 52),
        item("Mokoena Plumbing", 10, 64), item("info@mokoena.example.co.za", 180, 64),
        item("Name Only Traders", 10, 88),
        item("Café Lumière", 10, 112), item("bonjour@lumiere.example.co.za", 180, 112), item("4200000003", 560, 112),
      ],
    }];
    const opts = { isHeader: clientLooksLikeHeaderRow, profile: CLIENT_PDF_PROFILE };
    const { table } = extractPdfProductTable(wide, opts);
    const { mapping } = suggestColumnMapping(table.headers);
    const rows = table.rows.map((cells) => validateClientImportRow(applyColumnMapping(mapping, cells)));
    expect(rows.map((r) => r.value.name)).toEqual(["Riverside Primary School", "Mokoena Plumbing", "Name Only Traders", "Café Lumière"]);
    expect(rows[0].value.address).toBe("1 River Road Unit 4, Cape Town");
    expect(rows[1].value.tax_id).toBe("");
    expect(rows[2].errors.map((e) => e.field)).toEqual(["email"]);
    expect(rows[3].value.tax_id).toBe("4200000003");
  });

  it("does not pretend a client table is a product price list", () => {
    const { table } = extractPdfProductTable(pages);
    expect(table).toBeNull();
  });
});
