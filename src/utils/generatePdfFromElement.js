import {
  CONTENT_WIDTH_MM,
  PDF_PAGE_MARGIN_MM,
} from "@/lib/documentPdf/pageGeometry";

function clampDocLogos(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("img.paidly-doc-logo").forEach((img) => {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const scale = Math.min(180 / nw, 64 / nh, 1);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    img.setAttribute("width", String(w));
    img.setAttribute("height", String(h));
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.maxWidth = `${w}px`;
    img.style.maxHeight = `${h}px`;
  });
}

function html2CanvasOnClone(clonedDoc) {
  try {
    clampDocLogos(clonedDoc);
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
    clonedDoc.querySelectorAll(".paidly-doc-measure").forEach((el) => {
      el.remove();
    });
    const roots = clonedDoc.querySelectorAll(
      '[data-invoice-pdf-capture="true"], .document-preview-styled, [data-paidly-doc-ready]'
    );
    roots.forEach((root) => {
      let node = root;
      while (node && node !== clonedDoc) {
        node.style.opacity = "1";
        node = node.parentElement;
      }
    });
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
    // Applied by html2pdf to EVERY page (incl. continuation pages) so margins
    // are identical on page 1 and page 2+. [top, left, bottom, right] in mm.
    margin: PDF_PAGE_MARGIN_MM,
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
    pagebreak: { mode: ["css", "legacy"], avoid: [".paidly-keep", ".paidly-doc-page"] },
  };
}

async function withInvoicePdfElementStyles(element, filename, run) {
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxSizing = element.style.boxSizing;
  const originalPadding = element.style.padding;
  const originalBackground = element.style.backgroundColor;
  let pages = [];
  let pageStyles = [];

  try {
    element.classList.add("invoice-pdf-export");
    // Element width = printable content width (A4 minus left + right margins).
    // Margins are now applied by html2pdf on every page, so the element itself
    // carries no padding — this keeps margins consistent across all pages and
    // stops fixed-width children (210mm) from overflowing the printable area.
    const contentWidthMm = CONTENT_WIDTH_MM;
    element.style.width = `${contentWidthMm}mm`;
    element.style.maxWidth = `${contentWidthMm}mm`;
    element.style.boxSizing = "border-box";
    element.style.backgroundColor = "#ffffff";
    element.style.padding = "0";
    // Keep each preview page inside the PDF page so the footer is not sliced over the brand bar.
    element.querySelectorAll(".paidly-clean-document").forEach((sheet) => {
      sheet.style.setProperty("min-height", "auto", "important");
      sheet.style.setProperty("height", "auto", "important");
    });
    pages = [...element.querySelectorAll(".paidly-doc-page")];
    pageStyles = pages.map((page) => page.getAttribute("style"));
    pages.forEach((page) => {
      page.style.setProperty("min-height", "252mm", "important");
      page.style.setProperty("height", "auto", "important");
      page.style.setProperty("break-inside", "avoid", "important");
      page.style.setProperty("page-break-inside", "avoid", "important");
    });
    clampDocLogos(element);

    const html2pdf = (await import("html2pdf.js")).default;
    const options = buildHtml2PdfOptions(filename);
    return await run(html2pdf, options);
  } finally {
    element.classList.remove("invoice-pdf-export");
    pages.forEach((page, index) => {
      const previous = pageStyles[index];
      if (previous == null) page.removeAttribute("style");
      else page.setAttribute("style", previous);
    });
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
 * @param {{ scale?: number, quality?: number }} [render] — html2canvas scale / JPEG quality overrides
 * @returns {Promise<Blob>}
 */
export async function generatePdfBlobFromElement(element, filename = "document.pdf", { scale, quality } = {}) {
  if (!element) throw new Error("No element provided to generate PDF");
  return withInvoicePdfElementStyles(element, filename, (html2pdf, options) => {
    // Optional lighter render for email attachments (long multi-page documents); defaults unchanged.
    const set = {
      ...options,
      ...(quality ? { image: { ...options.image, quality } } : {}),
      ...(scale ? { html2canvas: { ...options.html2canvas, scale } } : {}),
    };
    return html2pdf().set(set).from(element).outputPdf("blob");
  });
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
