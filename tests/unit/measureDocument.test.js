/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  measureContentBlocks,
  measurePageChrome,
  measureRepeatChrome,
} from "@/lib/documentPdf/measureDocument";
import { paginateMeasuredDocument } from "@/lib/documentPdf/paginateMeasuredDocument";

function stubHeight(el, height) {
  el.getBoundingClientRect = () => ({
    height,
    width: 100,
    top: 0,
    left: 0,
    bottom: height,
    right: 100,
    x: 0,
    y: 0,
    toJSON() {},
  });
}

describe("measureDocument", () => {
  it("reads chrome, repeat chrome, and content blocks from data-doc attributes", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-doc-chrome="first-header"></div>
      <div data-doc-chrome="continuation-header"></div>
      <div data-doc-chrome="first-only"></div>
      <div data-doc-chrome="footer"></div>
      <div data-doc-repeat-chrome-measure="line-table"></div>
      <div data-doc-block="line-item" data-doc-block-id="line:0" data-doc-repeat-chrome="line-table" data-doc-meta='{"rowIndex":0}'></div>
      <div data-doc-block="totals-payment" data-doc-block-id="totals-payment"></div>
      <p data-doc-flow-leading="terms"></p>
      <p data-doc-flow-continued="terms"></p>
      <p data-doc-block="terms-part" data-doc-block-id="terms:0" data-doc-policy="flow-part" data-doc-flow-group="terms" data-doc-meta='{"termsIndex":0}'></p>
    `;
    stubHeight(root.querySelector('[data-doc-chrome="first-header"]'), 90);
    stubHeight(root.querySelector('[data-doc-chrome="continuation-header"]'), 40);
    stubHeight(root.querySelector('[data-doc-chrome="first-only"]'), 55);
    stubHeight(root.querySelector('[data-doc-chrome="footer"]'), 28);
    stubHeight(root.querySelector("[data-doc-repeat-chrome-measure]"), 22);
    stubHeight(root.querySelector('[data-doc-block="line-item"]'), 80);
    stubHeight(root.querySelector('[data-doc-block="totals-payment"]'), 120);
    stubHeight(root.querySelector("[data-doc-flow-leading]"), 18);
    stubHeight(root.querySelector("[data-doc-flow-continued]"), 16);
    stubHeight(root.querySelector('[data-doc-block="terms-part"]'), 44);

    const chrome = measurePageChrome(root);
    expect(chrome).toEqual({
      firstHeaderPx: 90,
      continuationHeaderPx: 40,
      firstOnlyPx: 55,
      footerPx: 28,
    });
    expect(measureRepeatChrome(root)).toEqual({ "line-table": 22 });

    const blocks = measureContentBlocks(root);
    expect(blocks.map((b) => b.id)).toEqual(["line:0", "totals-payment", "terms:0"]);
    expect(blocks[0].heightPx).toBe(80);
    expect(blocks[0].repeatChrome).toBe("line-table");
    expect(blocks[0].meta.rowIndex).toBe(0);
    expect(blocks[2].policy).toBe("flow-part");
    expect(blocks[2].firstLeadingPx).toBe(18);
    expect(blocks[2].continuedLeadingPx).toBe(16);

    const pages = paginateMeasuredDocument(root, { pageBudgetPx: 10_000, safetyPx: 0 });
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks.map((b) => b.id)).toEqual(["line:0", "totals-payment", "terms:0"]);
    expect(pages[0].showFirstOnly).toBe(true);
  });
});
