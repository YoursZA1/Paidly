/**
 * Product Import — rebuild tables from positioned PDF text. Pure: input is text items with page
 * coordinates (from pdf.js text content, or from OCR words), output is ImportTable-shaped data.
 *
 *   items → lines (same baseline) → cells (horizontal gaps, or "|" separators)
 *   → header line (names ≥2 product fields) → columns from the header's x-positions
 *   → each following line's cells land in the column they overlap; wrapped descriptions are joined
 *   → a repeated header (next page) continues the table; a different header starts a new one.
 *
 * With no recognisable header, rows of equal cell count are taken as a table and each column is
 * labelled from its contents (code / text / money / quantity) — marked `uncertain` so every row is
 * reviewed. Nothing here is ever imported without that review.
 */
import {
  IGNORE_COLUMN,
  looksLikeHeaderRow,
  normalizeHeader,
  parseImportMoney,
  parseImportStock,
  scoreHeaderForField,
  suggestColumnMapping,
} from "@shared/catalog/productImport.js";

/** @typedef {{ str: string, x: number, y: number, w: number, h: number, page: number }} PdfTextItem */
/** @typedef {{ text: string, x0: number, x1: number }} Cell */
/** @typedef {{ page: number, y: number, h: number, cells: Cell[] }} Line */

const KEY_FIELDS = ["sku", "price", "cost_price", "stock", "barcode", "vat"];
const TEXT_FIELDS = ["name", "description", "category", "brand"];
const NUMERIC_FIELDS = ["price", "cost_price", "stock"];

/**
 * How a header's columns are read. keyFields: a value there starts a new row. textFields: a line with
 * only these may be a wrapped continuation of the row above. keepLoneKey: a line with a single key
 * value is a row, not a section title (so a name-only client stays visible for review).
 * @typedef {{ fieldFor: (label: string) => string | null, keyFields: string[], textFields: string[], numericFields: string[], keepLoneKey?: boolean }} TableProfile
 */
const PAGE_FOOTER = /^(page\s+\d+(\s+of\s+\d+)?|\d+\s*\/\s*\d+)$/i;

/**
 * @param {PdfTextItem[]} items one page's items
 * @returns {Line[]}
 */
export function itemsToLines(items) {
  const clean = (items || [])
    .filter((it) => it && typeof it.str === "string" && it.str.trim() !== "" && Number.isFinite(it.x) && Number.isFinite(it.y))
    .map((it) => ({ ...it, w: Math.max(0, Number(it.w) || 0), h: Math.max(1, Number(it.h) || 10) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  /** @type {Array<{ page: number, y: number, h: number, items: PdfTextItem[] }>} */
  const raw = [];
  for (const it of clean) {
    const last = raw[raw.length - 1];
    if (last && last.page === it.page && Math.abs(it.y - last.y) <= Math.max(2, 0.45 * Math.min(it.h, last.h))) {
      last.items.push(it);
    } else {
      raw.push({ page: it.page, y: it.y, h: it.h, items: [it] });
    }
  }
  return raw.map((l) => {
    const sorted = l.items.sort((a, b) => a.x - b.x);
    /** @type {Cell[]} */
    const cells = [];
    for (const it of sorted) {
      const prev = cells[cells.length - 1];
      const text = it.str.replace(/\s+/g, " ");
      const charW = it.w > 0 ? it.w / Math.max(1, it.str.length) : it.h * 0.5;
      const gap = prev ? it.x - prev.x1 : Infinity;
      if (prev && gap <= Math.max(charW * 1.6, it.h * 0.6)) {
        prev.text = `${prev.text}${gap > charW * 0.25 && !prev.text.endsWith(" ") && !text.startsWith(" ") ? " " : ""}${text}`;
        prev.x1 = Math.max(prev.x1, it.x + it.w);
      } else {
        cells.push({ text, x0: it.x, x1: it.x + it.w });
      }
    }
    // "ABC001 | Coca Cola 330ml | Beverages | R12.00 | 50" — explicit separators win.
    const joined = cells.map((c) => c.text).join(" ");
    let finalCells = cells;
    if ((joined.match(/\|/g) || []).length >= 2) {
      const parts = joined.split("|").map((p) => p.trim());
      const x0 = cells[0].x0;
      const span = (cells[cells.length - 1].x1 - x0) / Math.max(1, parts.length);
      finalCells = parts.map((p, i) => ({ text: p, x0: x0 + i * span, x1: x0 + (i + 1) * span })).filter((c, i, arr) => c.text !== "" || (i > 0 && i < arr.length - 1));
      finalCells.piped = true;
    }
    for (const c of finalCells) c.text = c.text.trim();
    return { page: l.page, y: l.y, h: l.h, cells: finalCells.filter((c) => c.text !== ""), piped: Boolean(finalCells.piped) };
  });
}

/** @type {TableProfile} */
const PRODUCT_PROFILE = Object.freeze({
  fieldFor: (label) => bestFieldFor(label),
  keyFields: KEY_FIELDS,
  textFields: TEXT_FIELDS,
  numericFields: NUMERIC_FIELDS,
  keepLoneKey: false,
});

function bestFieldFor(label) {
  let best = { field: null, score: 0 };
  for (const field of [...KEY_FIELDS, ...TEXT_FIELDS, "unit"]) {
    const s = scoreHeaderForField(label, field);
    if (s > best.score) best = { field, score: s };
  }
  return best.score >= 0.6 ? best.field : null;
}

function columnIndexFor(cell, columns) {
  let bestIdx = -1;
  let bestOverlap = 0;
  columns.forEach((col, i) => {
    const overlap = Math.min(cell.x1, col.right) - Math.max(cell.x0, col.left);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) return bestIdx;
  const center = (cell.x0 + cell.x1) / 2;
  let nearest = 0;
  columns.forEach((col, i) => {
    if (Math.abs(center - col.center) < Math.abs(center - columns[nearest].center)) nearest = i;
  });
  return nearest;
}

function headerKey(cells) {
  return cells.map((c) => normalizeHeader(c.text)).join("|");
}

/**
 * Tables anchored on header lines.
 * @param {Line[]} lines all pages, in reading order
 */
export function tablesFromHeaders(lines, isHeader = looksLikeHeaderRow, profile = PRODUCT_PROFILE) {
  const tables = [];
  let current = null;
  for (const line of lines) {
    const texts = line.cells.map((c) => c.text);
    if (!texts.length) continue;
    if (line.cells.length >= 2 && isHeader(texts)) {
      const key = headerKey(line.cells);
      if (current && current.key === key) {
        current.lastLine = null; // same header repeated on the next page
        current.closed = false;
        continue;
      }
      const headerCells = line.cells;
      const columns = headerCells.map((c, i) => {
        const prev = headerCells[i - 1];
        const next = headerCells[i + 1];
        return {
          label: c.text,
          field: profile.fieldFor(c.text),
          left: prev ? (prev.x1 + c.x0) / 2 : -Infinity,
          right: next ? (c.x1 + next.x0) / 2 : Infinity,
          center: (c.x0 + c.x1) / 2,
        };
      });
      current = { key, columns, rows: [], meta: [], lastLine: null, gaps: [] };
      tables.push(current);
      continue;
    }
    if (!current) continue;
    if (line.cells.length === 1 && PAGE_FOOTER.test(texts[0])) continue;

    const values = current.columns.map(() => "");
    let messy = false;
    for (const cell of line.cells) {
      const idx = columnIndexFor(cell, current.columns);
      if (values[idx]) messy = true;
      values[idx] = values[idx] ? `${values[idx]} ${cell.text}` : cell.text;
    }
    // Text that drifted into a number column ("Hot drinks R185.00"): give the text back to the empty
    // column on its left and keep the number — and flag the row for a closer look.
    current.columns.forEach((col, i) => {
      if (!profile.numericFields.includes(col.field) || !values[i]) return;
      const parse = col.field === "stock" ? parseImportStock : parseImportMoney;
      if (parse(values[i]) != null) return;
      messy = true;
      const m = values[i].match(/^(.*\S)\s+(\S+)$/);
      if (m && parse(m[2]) != null && i > 0 && !values[i - 1]) {
        values[i - 1] = m[1];
        values[i] = m[2];
      }
    });
    const filled = values.filter(Boolean).length;
    const hasKey = current.columns.some((col, i) => values[i] && profile.keyFields.includes(col.field));
    const tableHasKeys = current.columns.some((col) => profile.keyFields.includes(col.field));
    const prevLine = current.lastLine;
    const gap = prevLine && prevLine.page === line.page ? line.y - prevLine.y : Infinity;
    const typicalGap = current.gaps.length ? current.gaps.slice().sort((a, b) => a - b)[Math.floor(current.gaps.length / 2)] : line.h * 1.6;

    // One lone value in a wide table is a section title or a note, not a product.
    if (filled === 1 && current.columns.length >= 3 && !(profile.keepLoneKey && hasKey) && !(current.rows.length && gap <= Math.max(typicalGap * 1.25, line.h * 1.8) && !hasKey)) {
      continue;
    }
    if (!hasKey && tableHasKeys) {
      // A wrapped description directly under its row joins that row; anything else ends the table.
      const onlyText = current.columns.every((col, i) => !values[i] || profile.textFields.includes(col.field) || col.field == null);
      if (onlyText && current.rows.length && gap <= Math.max(typicalGap * 1.25, line.h * 1.8)) {
        const target = current.rows[current.rows.length - 1];
        values.forEach((v, i) => {
          if (v) target[i] = target[i] ? `${target[i]} ${v}` : v;
        });
        current.lastLine = line;
        continue;
      }
      if (current.rows.length) current.closed = true;
      continue;
    }
    if (current.closed) continue;
    if (prevLine && prevLine.page === line.page && Number.isFinite(gap)) current.gaps.push(gap);
    current.rows.push(values);
    current.meta.push({ page: line.page, messy });
    current.lastLine = line;
  }
  return tables
    .filter((t) => t.rows.length)
    .map((t) => ({ headers: t.columns.map((c) => c.label), rows: t.rows, rowMeta: t.meta, uncertain: false }));
}

const MONEY_LIKE = /^(?:r|zar|\$|€|£)?\s?\d{1,3}(?:[\s,.]\d{3})*(?:[.,]\d{2})$|^(?:r|zar|\$|€|£)\s?\d+(?:[.,]\d+)?$/i;
const INT_LIKE = /^\d{1,7}$/;
const PERCENT_LIKE = /^\d{1,2}(?:[.,]\d+)?\s?%$/;
const CODE_LIKE = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9\-_./]{2,24}$/;
const BARCODE_LIKE = /^\d{8}$|^\d{12,14}$/;

function classifyValue(v) {
  const s = String(v || "").trim();
  if (!s) return "empty";
  if (PERCENT_LIKE.test(s)) return "percent";
  if (BARCODE_LIKE.test(s)) return "barcode";
  if (MONEY_LIKE.test(s)) return "money";
  if (INT_LIKE.test(s)) return "int";
  if (CODE_LIKE.test(s) && !/\s/.test(s)) return "code";
  return "text";
}

/**
 * No header: take the most common cell count (≥3) and label columns from what they contain.
 * @param {Line[]} lines
 */
export function tableFromPatterns(lines) {
  const candidates = lines.filter((l) => l.cells.length >= 3 && !(l.cells.length === 1 && PAGE_FOOTER.test(l.cells[0].text)));
  if (candidates.length < 2) return null;
  const counts = new Map();
  for (const l of candidates) counts.set(l.cells.length, (counts.get(l.cells.length) || 0) + 1);
  const [width, freq] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (freq < 2) return null;
  const rowsLines = candidates.filter((l) => l.cells.length === width);
  const rows = rowsLines.map((l) => l.cells.map((c) => c.text));

  const kinds = Array.from({ length: width }, (_, c) => {
    const tally = {};
    for (const r of rows) {
      const k = classifyValue(r[c]);
      tally[k] = (tally[k] || 0) + 1;
    }
    const [kind, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return { kind: n / rows.length >= 0.6 ? kind : "text", avgLen: rows.reduce((s, r) => s + String(r[c] || "").length, 0) / rows.length };
  });
  // A table must at least have text (the product) and a number.
  if (!kinds.some((k) => k.kind === "text") || !kinds.some((k) => ["money", "int"].includes(k.kind))) return null;

  const headers = kinds.map((_, i) => `Column ${i + 1}`);
  const textCols = kinds.map((k, i) => ({ ...k, i })).filter((k) => k.kind === "text").sort((a, b) => b.avgLen - a.avgLen);
  if (textCols[0]) headers[textCols[0].i] = "Product Name";
  if (textCols[1]) headers[textCols[1].i] = "Category";
  const codeCol = kinds.findIndex((k) => k.kind === "code");
  if (codeCol >= 0) headers[codeCol] = "SKU";
  const barcodeCol = kinds.findIndex((k) => k.kind === "barcode");
  if (barcodeCol >= 0) headers[barcodeCol] = "Barcode";
  const percentCol = kinds.findIndex((k) => k.kind === "percent");
  if (percentCol >= 0) headers[percentCol] = "VAT";
  const moneyCols = kinds.map((k, i) => ({ ...k, i })).filter((k) => k.kind === "money");
  const avgMoney = (i) => rows.reduce((s, r) => s + (Number(String(r[i]).replace(/[^\d.]/g, "")) || 0), 0) / rows.length;
  if (moneyCols.length === 1) headers[moneyCols[0].i] = "Selling Price";
  else if (moneyCols.length >= 2) {
    const [a, b] = moneyCols.slice(-2).map((m) => m.i);
    headers[avgMoney(a) >= avgMoney(b) ? a : b] = "Selling Price";
    headers[avgMoney(a) >= avgMoney(b) ? b : a] = "Cost Price";
  }
  const intCol = kinds.map((k, i) => ({ ...k, i })).filter((k) => k.kind === "int").pop();
  if (intCol) headers[intCol.i] = "Stock";

  return {
    headers,
    rows,
    rowMeta: rowsLines.map((l) => ({ page: l.page, messy: false })),
    uncertain: true,
  };
}

/**
 * Merge a document's tables into one. Columns are joined by the Paidly field each table's own heading
 * suggests ("Product Name" in one table, "Item Description" in another → one name column), else by
 * label, so a second table with different headings or column order still lines up.
 */
export function mergeTables(tables) {
  const labels = [];
  const labelIndex = new Map();
  const keysPerTable = tables.map((t) => {
    const { mapping } = tables.length > 1 ? suggestColumnMapping(t.headers) : { mapping: [] };
    return t.headers.map((h, c) => (mapping[c] && mapping[c] !== IGNORE_COLUMN ? `f:${mapping[c]}` : `l:${normalizeHeader(h)}`));
  });
  tables.forEach((t, ti) => {
    t.headers.forEach((h, c) => {
      const key = keysPerTable[ti][c];
      if (!labelIndex.has(key)) {
        labelIndex.set(key, labels.length);
        labels.push(h);
      }
    });
  });
  const rows = [];
  const rowMeta = [];
  tables.forEach((t, tableIdx) => {
    const map = keysPerTable[tableIdx].map((key) => labelIndex.get(key));
    t.rows.forEach((r, i) => {
      const out = labels.map(() => "");
      r.forEach((v, c) => {
        const target = map[c];
        out[target] = out[target] ? `${out[target]} ${v}` : v;
      });
      rows.push(out);
      rowMeta.push({ ...(t.rowMeta?.[i] || {}), table: tableIdx + 1, uncertain: Boolean(t.uncertain) });
    });
  });
  return {
    headers: labels,
    rows,
    rowNumbers: rows.map((_, i) => i + 1),
    rowMeta,
    headerDetected: tables.some((t) => !t.uncertain),
    uncertain: tables.every((t) => t.uncertain),
    tableCount: tables.length,
  };
}

/**
 * @param {Array<{ pageNumber: number, items: PdfTextItem[] }>} pages
 * @returns {{ table: ReturnType<typeof mergeTables> | null, textChars: number }}
 */
export function extractPdfProductTable(pages, opts = {}) {
  const isHeader = opts.isHeader || looksLikeHeaderRow;
  const profile = opts.profile || PRODUCT_PROFILE;
  const lines = [];
  let textChars = 0;
  for (const p of pages || []) {
    for (const it of p.items || []) textChars += String(it.str || "").replace(/\s/g, "").length;
    lines.push(...itemsToLines((p.items || []).map((it) => ({ ...it, page: p.pageNumber }))));
  }
  let tables = tablesFromHeaders(lines, isHeader, profile);
  if (!tables.length) {
    const fallback = tableFromPatterns(lines);
    tables = fallback ? [fallback] : [];
  }
  return { table: tables.length ? mergeTables(tables) : null, textChars };
}

/** Too little text for the page count → scanned / image-only. */
export function looksScanned(textChars, pageCount) {
  return textChars < Math.max(20, 25 * Math.min(pageCount || 1, 5));
}
