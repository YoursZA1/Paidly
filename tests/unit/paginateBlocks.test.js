import { describe, expect, it } from "vitest";
import { createBlock } from "@/lib/documentPdf/blocks";
import { paginateBlocks } from "@/lib/documentPdf/paginateBlocks";

const chrome = {
  firstHeaderPx: 80,
  continuationHeaderPx: 40,
  firstOnlyPx: 40,
  footerPx: 30,
};

describe("paginateBlocks", () => {
  it("packs atomic blocks onto pages by measured height, never by item count", () => {
    const blocks = [40, 200, 40, 200, 40].map((h, i) =>
      createBlock({
        id: `line:${i}`,
        kind: "line-item",
        heightPx: h,
        repeatChrome: "line-table",
        meta: { rowIndex: i },
      })
    );
    const pages = paginateBlocks({
      blocks,
      pageBudgetPx: 400,
      chrome,
      repeatChromeHeights: { "line-table": 24 },
    });
    const ids = pages.flatMap((p) => p.blocks.map((b) => b.id));
    expect(ids).toEqual(["line:0", "line:1", "line:2", "line:3", "line:4"]);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.blocks.every((b) => b.kind === "line-item")).toBe(true);
    }
  });

  it("moves an atomic totals block intact to the next page", () => {
    const pages = paginateBlocks({
      blocks: [
        createBlock({ id: "line:0", kind: "line-item", heightPx: 180, repeatChrome: "line-table" }),
        createBlock({ id: "line:1", kind: "line-item", heightPx: 180, repeatChrome: "line-table" }),
        createBlock({ id: "totals", kind: "totals-payment", heightPx: 180 }),
      ],
      pageBudgetPx: 420,
      chrome: { firstHeaderPx: 40, continuationHeaderPx: 40, firstOnlyPx: 20, footerPx: 20 },
      repeatChromeHeights: { "line-table": 20 },
    });
    const totalsPage = pages.find((p) => p.blocks.some((b) => b.kind === "totals-payment"));
    expect(totalsPage).toBeTruthy();
    expect(totalsPage.blocks.filter((b) => b.kind === "totals-payment")).toHaveLength(1);
    expect(totalsPage.blocks.some((b) => b.kind === "line-item")).toBe(false);
  });

  it("flows a group across pages with continued heading", () => {
    const pages = paginateBlocks({
      blocks: [0, 1, 2, 3].map((i) =>
        createBlock({
          id: `t:${i}`,
          kind: "terms-part",
          heightPx: 90,
          policy: "flow-part",
          flowGroup: "terms",
          firstLeadingPx: 20,
          continuedLeadingPx: 20,
          meta: { termsIndex: i },
        })
      ),
      pageBudgetPx: 280,
      chrome: { firstHeaderPx: 30, continuationHeaderPx: 30, firstOnlyPx: 0, footerPx: 20 },
    });
    const termPages = pages.filter((p) => p.blocks.some((b) => b.kind === "terms-part"));
    expect(termPages.length).toBeGreaterThan(1);
    expect(termPages[0].flowContinued.terms).toBe(false);
    expect(termPages.slice(1).every((p) => p.flowContinued.terms === true)).toBe(true);
  });
});
