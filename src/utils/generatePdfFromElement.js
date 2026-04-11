/** A4 page size in mm (ISO 216). */
const A4_WIDTH_MM = 210;

/** Document margins for PDF: [top, left, bottom, right] in mm. */
const PDF_PAGE_MARGIN_MM = [15, 18, 15, 18];

function html2CanvasOnClone(clonedDoc) {
  try {
    const win = clonedDoc.defaultView;
    if (!win) return;
    clonedDoc.body.querySelectorAll("*").forEach((el) => {
      try {
        const br = win.getComputedStyle(el).borderRadius;
        if (br == null || br === "" || br === "undefined" || /undefined/i.test(String(br))) {
          el.style.borderRadius = "0px";
        }
      } catch {
        /* ignore per-node */
      }
    });
    /* html2canvas mis-renders -webkit-line-clamp (second line sliced). Strip inside captured invoice/preview roots only. */
    const roots = clonedDoc.querySelectorAll(
      '[data-invoice-pdf-capture="true"], .document-preview-styled'
    );
    roots.forEach((root) => {
      root.querySelectorAll(".line-clamp-1, .line-clamp-2, .line-clamp-3, .line-clamp-4, .line-clamp-5, .line-clamp-6").forEach((el) => {
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("-webkit-box-orient", "unset", "important");
        el.style.setProperty("-webkit-line-clamp", "unset", "important");
        el.style.setProperty("line-clamp", "unset", "important");
      });
    });
  } catch {
    /* ignore */
  }
}

function buildHtml2PdfOptions(filename) {
  return {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 3,
      useCORS: true,
      letterRendering: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: html2CanvasOnClone,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    /* Omit avoid-all so long invoices can span multiple A4 pages (css + legacy pagebreak). */
    pagebreak: { mode: ["css", "legacy"] },
  };
}

async function withInvoicePdfElementStyles(element, filename, run) {
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxSizing = element.style.boxSizing;
  const originalPadding = element.style.padding;
  const originalBackground = element.style.backgroundColor;

  try {
    element.classList.add("invoice-pdf-export");
    element.style.width = `${A4_WIDTH_MM}mm`;
    element.style.maxWidth = `${A4_WIDTH_MM}mm`;
    element.style.boxSizing = "border-box";
    element.style.backgroundColor = "#ffffff";
    element.style.padding = `${PDF_PAGE_MARGIN_MM[0]}mm ${PDF_PAGE_MARGIN_MM[1]}mm ${PDF_PAGE_MARGIN_MM[2]}mm ${PDF_PAGE_MARGIN_MM[3]}mm`;

    const html2pdf = (await import("html2pdf.js")).default;
    const options = buildHtml2PdfOptions(filename);
    return await run(html2pdf, options);
  } finally {
    element.classList.remove("invoice-pdf-export");
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.boxSizing = originalBoxSizing;
    element.style.padding = originalPadding || "";
    element.style.backgroundColor = originalBackground || "";
  }
}

/**
 * Same pipeline as {@link generatePdfFromElement} (html2pdf only), but returns a Blob for uploads/email.
 * Does not use the Anvil engine (attachments need an in-memory PDF).
 *
 * @param {HTMLElement} element
 * @param {string} [filename]
 * @returns {Promise<Blob>}
 */
export async function generatePdfBlobFromElement(element, filename = "document.pdf") {
  if (!element) throw new Error("No element provided to generate PDF");
  return withInvoicePdfElementStyles(element, filename, (html2pdf, options) =>
    html2pdf().set(options).from(element).outputPdf("blob")
  );
}

/**
 * Generate a high-resolution PDF from an HTML element (invoice/quote).
 * - Default: html2pdf.js in the browser.
 * - Set `VITE_PDF_ENGINE=anvil` to use Anvil API via POST /api/generate-pdf-html (requires ANVIL_API_TOKEN on server).
 *
 * @param {HTMLElement} element - The DOM node to capture (e.g. invoice container)
 * @param {string} filename - Output filename (e.g. 'INV-001.pdf')
 * @param {{ css?: string, title?: string, page?: object }} [anvilOptions] - Passed when using Anvil
 */
export default async function generatePdfFromElement(element, filename = "document.pdf", anvilOptions = {}) {
  if (!element) throw new Error("No element provided to generate PDF");

  const engine = (import.meta.env.VITE_PDF_ENGINE || "html2pdf").toString().trim().toLowerCase();
  if (engine === "anvil") {
    try {
      const { default: generatePdfFromAnvil } = await import("./generatePdfFromAnvil.js");
      await generatePdfFromAnvil(element, filename, anvilOptions);
      return;
    } catch (e) {
      console.warn("[pdf] Anvil failed, falling back to html2pdf:", e?.message || e);
    }
  }

  await withInvoicePdfElementStyles(element, filename, (html2pdf, options) =>
    html2pdf().set(options).from(element).save()
  );
}
