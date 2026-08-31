/**
 * Printable PDF document engine.
 *
 * Document → Page → Blocks → measured content → pagination
 *
 * Invoice and quote share this engine. Receipts, statements, and purchase
 * orders should emit blocks the same way — do not add a second paginator.
 */

export {
  CONTENT_HEIGHT_MM,
  CONTENT_HEIGHT_PX,
  CONTENT_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_OVERFLOW_SAFETY_PX,
  PAGE_WIDTH_MM,
  PDF_PAGE_MARGIN_MM,
  PX_PER_MM,
  SAFE_MARGIN,
} from "./pageGeometry.js";

export { createBlock } from "./blocks.js";
export { paginateBlocks } from "./paginateBlocks.js";
export { pageBlockRuns } from "./pageBlockRuns.js";
export {
  measureContentBlocks,
  measurePageChrome,
  measureRepeatChrome,
} from "./measureDocument.js";
export { paginateMeasuredDocument } from "./paginateMeasuredDocument.js";
export { splitFlowableText } from "./splitFlowableText.js";
export {
  commercialMeasurementsToBlocks,
  commercialPagesToPlan,
  paginateCommercialDocument,
} from "./paginateCommercialDocument.js";
export {
  waitForPdfAssets,
  waitForPdfDocumentReady,
  waitForPdfImages,
  waitUntilElementReady,
} from "./waitForPdfDocumentReady.js";
