/**
 * Invoice / quote numeric adapter (unit tests and non-DOM callers).
 *
 * Production preview measures the live DOM via {@link paginateMeasuredDocument}.
 * Receipts, statements, and POs should emit `createBlock(...)` and call
 * {@link paginateBlocks} — do not add a second paginator.
 */

import { createBlock } from "./blocks.js";
import { paginateBlocks } from "./paginateBlocks.js";

export { splitFlowableText } from "./splitFlowableText.js";

const LINE_TABLE = "line-table";
const TERMS = "terms";

/**
 * @param {object} m  measured px (unit tests / non-DOM). Production uses {@link paginateMeasuredDocument}.
 * @returns {import("./blocks.js").DocumentBlock[]}
 */
export function commercialMeasurementsToBlocks(m) {
  const blocks = [];
  const rows = Array.isArray(m.rowHeights) ? m.rowHeights : [];

  if (rows.length === 0) {
    blocks.push(
      createBlock({
        id: "line-empty",
        kind: "line-item-empty",
        heightPx: Math.max(0, m.emptyTableRowPx || 0),
        repeatChrome: LINE_TABLE,
      })
    );
  } else {
    rows.forEach((h, i) => {
      blocks.push(
        createBlock({
          id: `line:${i}`,
          kind: "line-item",
          heightPx: h,
          repeatChrome: LINE_TABLE,
          meta: { rowIndex: i },
        })
      );
    });
  }

  const totals = Math.max(0, m.totalsBlockPx || 0);
  if (totals > 0) {
    blocks.push(
      createBlock({
        id: "totals-payment",
        kind: "totals-payment",
        heightPx: totals,
      })
    );
  }

  const notes = Math.max(0, m.notesPx || 0);
  if (notes > 0) {
    blocks.push(
      createBlock({
        id: "notes",
        kind: "notes",
        heightPx: notes,
      })
    );
  }

  const termsHeights = Array.isArray(m.termsPartHeights) ? m.termsPartHeights : [];
  termsHeights.forEach((h, i) => {
    blocks.push(
      createBlock({
        id: `terms:${i}`,
        kind: "terms-part",
        heightPx: h,
        policy: "flow-part",
        flowGroup: TERMS,
        firstLeadingPx: m.termsHeadingPx || 0,
        continuedLeadingPx: m.termsContinuedHeadingPx || 0,
        meta: { termsIndex: i },
      })
    );
  });

  return blocks;
}

/**
 * @param {ReturnType<typeof paginateBlocks>} pages
 */
export function commercialPagesToPlan(pages) {
  return pages.map((page) => {
    const rowIndexes = page.blocks
      .filter((b) => b.kind === "line-item")
      .map((b) => Number(b.meta.rowIndex))
      .filter((n) => Number.isFinite(n));
    const termsPartIndexes = page.blocks
      .filter((b) => b.kind === "terms-part")
      .map((b) => Number(b.meta.termsIndex))
      .filter((n) => Number.isFinite(n));
    return {
      isFirst: page.isFirst,
      showBillTo: page.showFirstOnly,
      showTable: page.blocks.some((b) => b.kind === "line-item" || b.kind === "line-item-empty"),
      rowIndexes,
      showTotals: page.blocks.some((b) => b.kind === "totals-payment"),
      showNotes: page.blocks.some((b) => b.kind === "notes"),
      termsPartIndexes,
      termsContinued: Boolean(page.flowContinued?.[TERMS]),
      blocks: page.blocks,
    };
  });
}

/**
 * Invoice + quote pagination. Same engine as any future document kind.
 * @param {object} m
 */
export function paginateCommercialDocument(m) {
  const pages = paginateBlocks({
    blocks: commercialMeasurementsToBlocks(m),
    pageBudgetPx: m.pageBudgetPx,
    safetyPx: m.safetyPx,
    chrome: {
      firstHeaderPx: m.firstHeaderPx,
      continuationHeaderPx: m.continuationHeaderPx,
      firstOnlyPx: m.billToPx,
      footerPx: m.footerPx,
    },
    repeatChromeHeights: { [LINE_TABLE]: Math.max(0, m.tableHeaderPx || 0) },
  });
  return commercialPagesToPlan(pages);
}
