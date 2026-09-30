/**
 * Product Import — CSV and Excel → a plain table of strings. Pure (the xlsx module is passed in), so
 * the same code runs in the parsing Web Worker, on the main thread as a fallback, and in tests.
 *
 * Every cell becomes a string. Formulas are never evaluated: SheetJS returns the value Excel cached
 * when the file was saved (cellFormula:false — formula text is not even parsed).
 */
import { IMPORT_LIMITS, looksLikeHeaderRow } from "@shared/catalog/productImport.js";

/** @typedef {{ headers: string[], rows: string[][], rowNumbers: number[], headerDetected: boolean, sheetName?: string, truncated?: boolean }} ImportTable */

const HEADER_SCAN_ROWS = 15;

/** Number → text without exponent noise for integers (barcodes) and without float artefacts. */
export function cellToString(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (Number.isInteger(v)) return Number.isSafeInteger(v) ? String(v) : v.toExponential();
    return String(Math.round(v * 1e6) / 1e6);
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).replace(/\r\n?/g, "\n");
}

/**
 * Find the header row (first of the top rows that names ≥2 product fields) and build the table.
 * @param {string[][]} grid
 * @param {(i: number) => number} rowNumberOf sheet row number for grid index i
 * @returns {ImportTable | null}
 */
export function gridToTable(grid, rowNumberOf = (i) => i + 1) {
  const isBlank = (r) => !r || !r.some((c) => String(c ?? "").trim() !== "");
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i++) {
    if (!isBlank(grid[i]) && looksLikeHeaderRow(grid[i])) {
      headerIdx = i;
      break;
    }
  }
  const headerDetected = headerIdx >= 0;
  if (!headerDetected) headerIdx = grid.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) return null;

  const width = Math.max(...grid.slice(headerIdx).map((r) => (r ? r.length : 0)), 0);
  const headers = Array.from({ length: width }, (_, c) => {
    const h = String(grid[headerIdx]?.[c] ?? "").trim();
    return h || `Column ${c + 1}`;
  });
  const rows = [];
  const rowNumbers = [];
  let truncated = false;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    if (isBlank(grid[i])) continue;
    if (rows.length >= IMPORT_LIMITS.maxRows) {
      truncated = true;
      break;
    }
    rows.push(Array.from({ length: width }, (_, c) => String(grid[i]?.[c] ?? "")));
    rowNumbers.push(rowNumberOf(i));
  }
  return { headers, rows, rowNumbers, headerDetected, truncated };
}

/** Comma, semicolon (decimal-comma locales) or tab — whichever splits the first lines consistently. */
export function detectDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = consistent * 10 + counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC 4180-ish CSV (quoted fields, "" escapes, newlines inside quotes). All values are strings. */
export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const grid = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell.trim() === "") {
      inQuotes = true;
      cell = "";
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      grid.push(row);
      row = [];
      cell = "";
      if (grid.length > IMPORT_LIMITS.maxRows + HEADER_SCAN_ROWS + 1) break;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    grid.push(row);
  }
  return grid;
}

/** UTF-8 first; Excel on Windows often saves CSV as Windows-1252 (é → �), so fall back. */
export function decodeCsvBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return text.replace(/^\uFEFF/, "");
}

/** @returns {{ sheets: Array<{ name: string, table: ImportTable }> }} */
export function parseCsvBuffer(buffer) {
  const text = decodeCsvBytes(buffer);
  const table = gridToTable(parseDelimited(text));
  return { sheets: table ? [{ name: "CSV", table }] : [] };
}

/**
 * @param {any} XLSX the SheetJS module
 * @param {ArrayBuffer} buffer
 * @returns {{ sheets: Array<{ name: string, table: ImportTable }> }}
 */
export function parseWorkbookBuffer(XLSX, buffer) {
  const wb = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellDates: false,
    bookVBA: false,
    bookFiles: false,
    sheetStubs: false,
    // Stop reading far past what an import accepts (memory guard for huge / hostile sheets).
    sheetRows: IMPORT_LIMITS.maxRows + HEADER_SCAN_ROWS + 1,
    WTF: false,
  });
  const sheets = [];
  for (const name of (wb.SheetNames || []).slice(0, 20)) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    if (range.e.c - range.s.c > 200) range.e.c = range.s.c + 200;
    const grid = XLSX.utils
      .sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true, range })
      .map((r) => (Array.isArray(r) ? r.map(cellToString) : []));
    const table = gridToTable(grid, (i) => range.s.r + i + 1);
    if (table && table.rows.length) sheets.push({ name: String(name).slice(0, 60), table: { ...table, sheetName: name } });
  }
  return { sheets };
}

/** The sheet most likely to be the product list: a recognised header, then the most rows. */
export function pickBestSheet(sheets) {
  if (!sheets.length) return -1;
  let best = 0;
  sheets.forEach((s, i) => {
    const a = sheets[best].table;
    const b = s.table;
    if (Number(b.headerDetected) > Number(a.headerDetected) || (b.headerDetected === a.headerDetected && b.rows.length > a.rows.length)) best = i;
  });
  return best;
}
