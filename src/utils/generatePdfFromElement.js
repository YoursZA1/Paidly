/** A4 page size in mm (ISO 216). */
const A4_WIDTH_MM = 210;

/** Document margins for PDF: [top, left, bottom, right] in mm. */
const PDF_PAGE_MARGIN_MM = [15, 18, 15, 18];

/**
 * Generate a high-resolution PDF from an HTML element (invoice/quote).
 * - Default: html2pdf.js in the browser.
 * - Set `VITE_PDF_ENGINE=anvil` to use Anvil API via POST /api/generate-pdf-html (requires ANVIL_API_TOKEN on server).
 *
 * @param {HTMLElement} element - The DOM node to capture (e.g. invoice container)
 * @param {string} filename - Output filename (e.g. 'INV-001.pdf')
 * @param {{ css?: string, title?: string, page?: object }} [anvilOptions] - Passed when using Anvil
 */
export default async function generatePdfFromElement(element, filename = 'document.pdf', anvilOptions = {}) {
  if (!element) throw new Error('No element provided to generate PDF');

  const engine = (import.meta.env.VITE_PDF_ENGINE || 'html2pdf').toString().trim().toLowerCase();
  if (engine === 'anvil') {
    try {
      const { default: generatePdfFromAnvil } = await import('./generatePdfFromAnvil.js');
      await generatePdfFromAnvil(element, filename, anvilOptions);
      return;
    } catch (e) {
      console.warn('[pdf] Anvil failed, falling back to html2pdf:', e?.message || e);
    }
  }

  const html2pdf = (await import('html2pdf.js')).default;

  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxSizing = element.style.boxSizing;
  const originalPadding = element.style.padding;
  const originalBackground = element.style.backgroundColor;

  try {
    element.classList.add('invoice-pdf-export');
    element.style.width = `${A4_WIDTH_MM}mm`;
    element.style.maxWidth = `${A4_WIDTH_MM}mm`;
    element.style.boxSizing = 'border-box';
    element.style.backgroundColor = '#ffffff';
    element.style.padding = `${PDF_PAGE_MARGIN_MM[0]}mm ${PDF_PAGE_MARGIN_MM[1]}mm ${PDF_PAGE_MARGIN_MM[2]}mm ${PDF_PAGE_MARGIN_MM[3]}mm`;

    const options = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        letterRendering: true,
        logging: false,
        /** html2canvas can throw "Invalid border radius: undefined" on some Tailwind/cloned nodes. */
        onclone(clonedDoc) {
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
          } catch {
            /* ignore */
          }
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    await html2pdf().set(options).from(element).save();
  } finally {
    element.classList.remove('invoice-pdf-export');
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.boxSizing = originalBoxSizing;
    element.style.padding = originalPadding || '';
    element.style.backgroundColor = originalBackground || '';
  }
}
