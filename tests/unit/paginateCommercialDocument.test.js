import { describe, expect, it } from "vitest";
import {
  paginateCommercialDocument,
  splitFlowableText,
} from "@/lib/documentPdf/paginateCommercialDocument";

const BASE = {
  pageBudgetPx: 1000,
  safetyPx: 0,
  firstHeaderPx: 100,
  continuationHeaderPx: 50,
  billToPx: 80,
  tableHeaderPx: 30,
  emptyTableRowPx: 20,
  footerPx: 40,
  totalsBlockPx: 120,
  notesPx: 0,
  termsHeadingPx: 24,
  termsContinuedHeadingPx: 24,
  termsPartHeights: [],
};

describe("splitFlowableText", () => {
  it("returns empty for blank input", () => {
    expect(splitFlowableText("")).toEqual([]);
    expect(splitFlowableText(null)).toEqual([]);
  });

  it("splits on blank lines first", () => {
    expect(splitFlowableText("A\n\nB\n\nC")).toEqual(["A", "B", "C"]);
  });
});

describe("paginateCommercialDocument", () => {
  it("keeps a short invoice on one page", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      rowHeights: [40, 40, 40],
      totalsBlockPx: 100,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].rowIndexes).toEqual([0, 1, 2]);
    expect(pages[0].showTotals).toBe(true);
    expect(pages[0].showBillTo).toBe(true);
    expect(pages[0].showTable).toBe(true);
  });

  it("never splits a row; overflow row moves whole to next page", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      firstHeaderPx: 100,
      billToPx: 80,
      tableHeaderPx: 30,
      footerPx: 40,
      rowHeights: [200, 200, 200, 200],
      totalsBlockPx: 50,
    });
    const all = pages.flatMap((p) => p.rowIndexes);
    expect(all).toEqual([0, 1, 2, 3]);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const p of pages) {
      expect(new Set(p.rowIndexes).size).toBe(p.rowIndexes.length);
    }
  });

  it("keeps totals together on a trailing page when they do not fit", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      pageBudgetPx: 500,
      firstHeaderPx: 80,
      continuationHeaderPx: 40,
      billToPx: 40,
      tableHeaderPx: 20,
      footerPx: 30,
      rowHeights: [200, 200],
      totalsBlockPx: 180,
    });
    const totalsPages = pages.filter((p) => p.showTotals);
    expect(totalsPages).toHaveLength(1);
    expect(totalsPages[0].showTotals).toBe(true);
  });

  it("flows terms across pages with a continued flag", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      pageBudgetPx: 400,
      firstHeaderPx: 40,
      continuationHeaderPx: 40,
      billToPx: 20,
      tableHeaderPx: 20,
      footerPx: 30,
      rowHeights: [40],
      totalsBlockPx: 40,
      termsHeadingPx: 20,
      termsContinuedHeadingPx: 20,
      termsPartHeights: [80, 80, 80, 80],
    });
    const termPages = pages.filter((p) => p.termsPartIndexes.length > 0);
    expect(termPages.length).toBeGreaterThan(1);
    expect(termPages[0].termsContinued).toBe(false);
    expect(termPages.slice(1).every((p) => p.termsContinued)).toBe(true);
    expect(termPages.flatMap((p) => p.termsPartIndexes).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("places at least one oversized row (no infinite loop / blank-page bounce)", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      pageBudgetPx: 300,
      firstHeaderPx: 80,
      billToPx: 40,
      tableHeaderPx: 20,
      footerPx: 40,
      rowHeights: [500],
      totalsBlockPx: 40,
    });
    expect(pages.some((p) => p.rowIndexes.includes(0))).toBe(true);
  });

  it("empty items still produce a first page with table + totals", () => {
    const pages = paginateCommercialDocument({
      ...BASE,
      rowHeights: [],
      totalsBlockPx: 80,
    });
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].isFirst).toBe(true);
    expect(pages[0].showTable).toBe(true);
    expect(pages[0].showTotals).toBe(true);
  });
});
