import generatePdfFromElement from "./generatePdfFromElement";

/** Wait until after the next paint so refs (e.g. DocumentPreview) are attached. */
export function waitForPreviewPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * @param {"invoice" | "quote"} docType
 * @param {string} [numberRaw] invoice_number / quote_number / draft number
 */
export function buildDocumentPreviewPdfFilename(docType, numberRaw) {
  const fallback = docType === "quote" ? "quote-draft" : "invoice-draft";
  const raw = String(numberRaw ?? "").trim() || fallback;
  const safeBase = raw.replace(/[^\w.-]+/g, "_");
  return `${docType}-${safeBase}.pdf`;
}

/**
 * Save PDF from a live DocumentPreview DOM node (same pipeline as Create / View document).
 */
export async function downloadDocumentPreviewFromElement(element, docType, numberRaw, anvilPayload = null) {
  if (!element) {
    throw new Error("No element to export");
  }
  const filename = buildDocumentPreviewPdfFilename(docType, numberRaw);
  const engine = (import.meta.env.VITE_PDF_ENGINE || "html2pdf").toString().trim().toLowerCase();
  if (engine === "anvil" && anvilPayload?.doc) {
    const { generateDocumentPdfFromAnvil } = await import("./generatePdfFromAnvil.js");
    await generateDocumentPdfFromAnvil(
      { doc: anvilPayload.doc, docType },
      filename,
      { title: docType === "quote" ? "Quote" : "Invoice" }
    );
    return;
  }
  await generatePdfFromElement(element, filename);
}
