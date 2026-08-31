/**
 * Canonical A4 geometry for Paidly printable documents.
 * Invoice, quote, and later receipt / statement / PO share this page box.
 * html2pdf applies these margins on every page — keep one source of truth.
 */

/** A4 (ISO 216) millimetres. */
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

/** html2pdf margin: [top, left, bottom, right] mm. */
export const PDF_PAGE_MARGIN_MM = Object.freeze([15, 18, 15, 18]);

export const SAFE_MARGIN = Object.freeze({
  top: PDF_PAGE_MARGIN_MM[0],
  left: PDF_PAGE_MARGIN_MM[1],
  bottom: PDF_PAGE_MARGIN_MM[2],
  right: PDF_PAGE_MARGIN_MM[3],
});

export const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - SAFE_MARGIN.left - SAFE_MARGIN.right; // 174
export const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - SAFE_MARGIN.top - SAFE_MARGIN.bottom; // 267

/** CSS px @ 96dpi — the unit getBoundingClientRect uses before html2pdf scales to mm. */
export const PX_PER_MM = 96 / 25.4;

export const CONTENT_HEIGHT_PX = Math.floor(CONTENT_HEIGHT_MM * PX_PER_MM);

/**
 * Buffer so a page that measures just under the budget never exceeds it after
 * font rounding / border collapse (avoids html2pdf re-slicing into the footer).
 */
export const PAGE_OVERFLOW_SAFETY_PX = 28;
