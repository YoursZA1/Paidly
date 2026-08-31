import { paginateBlocks } from "./paginateBlocks.js";
import { measureContentBlocks, measurePageChrome, measureRepeatChrome } from "./measureDocument.js";

/**
 * Full pipeline: measured DOM → blocks → pages.
 * Invoice, quote, and later receipt/statement/PO all enter here.
 *
 * @param {ParentNode} root  hidden measure tree
 * @param {{ pageBudgetPx: number, safetyPx?: number }} geometry
 */
export function paginateMeasuredDocument(root, geometry) {
  return paginateBlocks({
    blocks: measureContentBlocks(root),
    chrome: measurePageChrome(root),
    repeatChromeHeights: measureRepeatChrome(root),
    pageBudgetPx: geometry.pageBudgetPx,
    safetyPx: geometry.safetyPx,
  });
}
