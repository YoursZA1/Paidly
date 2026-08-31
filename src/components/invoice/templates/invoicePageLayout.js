/**
 * invoicePageLayout.js
 * ─────────────────────────────────────────────────────────────────────────
 * Centralised A4 layout system + pagination engine shared by every invoice /
 * quote template variant (Classic, Modern, Minimal, Bold, Paidly Pro) and
 * inherited by any future template.
 *
 * WHY THIS MODULE EXISTS
 * Alternate invoice skins (Classic, Modern, Minimal, Bold) still paginate from
 * estimated row heights. The production default (DocumentPreview — invoices and
 * quotes) uses Document → Page → Blocks with live measured heights in
 * `src/lib/documentPdf/`. Do not add a "N items per page" rule here or there.
 * The templates render as HTML and export through html2pdf (html → canvas →
 * PDF). html2pdf slices the rendered DOM into A4 pages; if a single `.page`
 * block is taller than one printable page it gets re-sliced mid-element —
 * which is what made page 2 lose its header/footer and made long tables
 * break unpredictably.
 *
 * The fix is to PRE-PAGINATE in React so every `.page` block is guaranteed to
 * fit one printable page. Each block then renders its own header + footer, so
 * html2pdf maps one block → one PDF page with no re-slicing. This module owns
 * all of that math so no template carries magic numbers.
 *
 * UNITS
 * - Page geometry is in millimetres (the print / A4 domain).
 * - Vertical budgeting is in CSS pixels @96dpi — the unit the DOM renders in
 *   before html2pdf scales px → mm. Both are derived from the same constants.
 */

import {
  CONTENT_HEIGHT_MM,
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  SAFE_MARGIN,
} from "@/lib/documentPdf/pageGeometry";

export const PAGE_WIDTH = PAGE_WIDTH_MM;
export const PAGE_HEIGHT = PAGE_HEIGHT_MM;
export { SAFE_MARGIN, CONTENT_HEIGHT_PX };

export const CONTENT_TOP = SAFE_MARGIN.top;
export const CONTENT_BOTTOM = PAGE_HEIGHT_MM - SAFE_MARGIN.bottom;
export const CONTENT_WIDTH = CONTENT_WIDTH_MM;
export const CONTENT_HEIGHT = CONTENT_HEIGHT_MM;

/**
 * Safety buffer (px) subtracted from every page budget. The region heights
 * below are estimates; this buffer absorbs estimation error so a page never
 * *slightly* exceeds the printable height and triggers an html2pdf re-slice.
 */
export const OVERFLOW_SAFETY_PX = 36;

/**
 * Estimated rendered heights (px) of the fixed regions the engine must reserve
 * space for.
 *
 * BIAS HIGH ON PURPOSE. Section margins, borders and wrapped text make real
 * heights larger than a naive count. Over-reserving only triggers a page break
 * slightly early (a little whitespace); under-reserving bleeds content into the
 * footer and lets html2pdf hard-slice a paragraph mid-sentence. Tune here only.
 */
export const HEADER_HEIGHT = {
  first: 148, // full header (logo + title + accent rule / colour band) — page 1
  continuation: 88, // compact "continued" header — page 2+
};
export const FOOTER_HEIGHT = {
  running: 54, // slim footer (company name + page number) — non-final pages
  detailed: 106, // full footer (contact details + page number) — final page
};
export const REGION_HEIGHT = {
  billToBand: 172, // invoice-to / ship-to band (+ section margin) — page 1 only
  tableHeader: 44, // column-header row — repeats on every table page
  // Payment details + payment structure + totals + notes + terms, including
  // every section's margin/border. This whole group lives on the final page
  // and is reserved as one indivisible block so it can never be split.
  totalsBlock: 384,
  rowBase: 38, // a single-line line-item row (+ row border + padding)
  rowWrapLine: 17, // extra height per wrapped line of description text
};

/** Description characters that fit on one visual line in the 50%-width column. */
const ROW_CHARS_PER_LINE = 72;

/**
 * Configurable row-height logic: estimate the rendered height (px) of one
 * line-item row — base height plus one wrap-line increment per extra visual
 * line of description text. Handles 1 → 200+ items predictably.
 *
 * @param {string} label - the formatted "name - description" line.
 * @returns {number} estimated row height in px.
 */
export function estimateRowHeight(label) {
  const text = String(label || "");
  const extraLines = Math.max(0, Math.ceil(text.length / ROW_CHARS_PER_LINE) - 1);
  return REGION_HEIGHT.rowBase + extraLines * REGION_HEIGHT.rowWrapLine;
}

/**
 * calculateRemainingHeight() — vertical space (px) available for line-item
 * ROWS on a page, after reserving the header, footer, repeated table header,
 * the page-1 bill-to band, and (on the final page) the indivisible totals
 * block. This is the core of "detect overflow before rendering rows".
 *
 * @param {{ isFirst:boolean, isFinal:boolean }} page
 * @returns {number} px of vertical space available for rows.
 */
export function rowBudgetForPage({ isFirst, isFinal }) {
  const header = isFirst ? HEADER_HEIGHT.first : HEADER_HEIGHT.continuation;
  const footer = isFinal ? FOOTER_HEIGHT.detailed : FOOTER_HEIGHT.running;
  const band = isFirst ? REGION_HEIGHT.billToBand : 0;
  const totals = isFinal ? REGION_HEIGHT.totalsBlock : 0;
  return (
    CONTENT_HEIGHT_PX -
    OVERFLOW_SAFETY_PX -
    header -
    band -
    REGION_HEIGHT.tableHeader -
    totals -
    footer
  );
}

/**
 * Pagination engine. Splits line items into pages whose content is guaranteed
 * to fit one printable A4 page, so html2pdf maps one `.page` block → one PDF
 * page and never re-slices a page mid-row.
 *
 * PAGINATION DECISIONS
 * 1. Greedy fill — rows are packed onto a page until the next row would exceed
 *    that page's row budget (header/footer/band/table-header already reserved).
 * 2. Forward-progress guarantee — at least one row is always placed per page,
 *    even if a single row is taller than the budget (avoids an infinite loop).
 * 3. Totals are indivisible and pinned to the FINAL page. If the last row-page
 *    cannot also fit the totals block + detailed footer, totals move to their
 *    own trailing page. This is why the totals section can never split.
 *
 * @param {Array} items
 * @param {{ getLabel:(item:any)=>string }} opts
 * @returns {Array<{ rows:Array, isFirst:boolean, hasTable:boolean }>}
 *          One entry per physical page, in render order. `hasTable` is false
 *          only for a trailing totals-only page.
 */
export function paginateInvoice(items, { getLabel }) {
  const list = Array.isArray(items) ? items : [];

  // Empty invoice — a single page still renders the header, the empty table,
  // the totals block and the footer.
  if (list.length === 0) {
    return [{ rows: [], isFirst: true, hasTable: true }];
  }

  const heights = list.map((item) => estimateRowHeight(getLabel(item)));

  // Pass 1 — greedily pack rows, treating every page as non-final (running
  // footer, no totals reserved). Final-page totals are reconciled in pass 2.
  const pages = [];
  let cursor = 0;
  while (cursor < list.length) {
    const isFirst = pages.length === 0;
    const budget = rowBudgetForPage({ isFirst, isFinal: false });
    const rows = [];
    let used = 0;
    while (cursor < list.length) {
      const rowHeight = heights[cursor];
      if (rows.length > 0 && used + rowHeight > budget) break;
      rows.push(list[cursor]);
      used += rowHeight;
      cursor += 1;
    }
    pages.push({ rows, isFirst, usedHeight: used, hasTable: true });
  }

  // Pass 2 — place the indivisible totals block. It stays on the last row-page
  // only if that page still has room for totals + the detailed footer;
  // otherwise it moves to a dedicated trailing page (table suppressed).
  const last = pages[pages.length - 1];
  const finalRowBudget = rowBudgetForPage({ isFirst: last.isFirst, isFinal: true });
  if (last.usedHeight > finalRowBudget) {
    pages.push({ rows: [], isFirst: false, usedHeight: 0, hasTable: false });
  }

  return pages.map(({ rows, isFirst, hasTable }) => ({ rows, isFirst, hasTable }));
}
