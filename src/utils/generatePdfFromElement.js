import html2pdf from 'html2pdf.js';

/**
 * Generate a high-resolution PDF from an HTML element (invoice/quote).
 * Uses html2pdf.js with scale 3 for sharp text; forces 210mm width for A4.
 * @param {HTMLElement} element - The DOM node to capture (e.g. invoice container)
 * @param {string} filename - Output filename (e.g. 'INV-001.pdf')
 */
export default async function generatePdfFromElement(element, filename = 'document.pdf') {
  if (!element) throw new Error('No element provided to generate PDF');

  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxSizing = element.style.boxSizing;
  const originalBackground = element.style.backgroundColor;

  try {
    element.classList.add('invoice-pdf-export');
    element.style.width = '210mm';
    element.style.maxWidth = '210mm';
    element.style.boxSizing = 'border-box';
    element.style.backgroundColor = '#ffffff';

    const options = {
      margin: [0, 0, 0, 0],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        letterRendering: true,
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    await html2pdf().set(options).from(element).save();
  } finally {
    element.classList.remove('invoice-pdf-export');
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.boxSizing = originalBoxSizing;
    element.style.backgroundColor = originalBackground || '';
  }
}
