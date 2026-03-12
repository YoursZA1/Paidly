import html2pdf from 'html2pdf.js';

/** A4 page size in mm (ISO 216). */
const A4_WIDTH_MM = 210;

/** Document margins for PDF: [top, left, bottom, right] in mm. */
const PDF_PAGE_MARGIN_MM = [15, 18, 15, 18];

/**
 * Generate a high-resolution PDF from an HTML element (invoice/quote).
 * Uses html2pdf.js with scale 3 for sharp text; forces content width to A4 and applies document margins.
 * @param {HTMLElement} element - The DOM node to capture (e.g. invoice container)
 * @param {string} filename - Output filename (e.g. 'INV-001.pdf')
 */
export default async function generatePdfFromElement(element, filename = 'document.pdf') {
  if (!element) throw new Error('No element provided to generate PDF');

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
    // Document margins: apply as padding so the captured area has correct left/right (and top/bottom) inset
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
