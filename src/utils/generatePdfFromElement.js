import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Generate a multi-page PDF from an HTML element.
// element: DOM node
// filename: output filename (string)
export default async function generatePdfFromElement(element, filename = 'document.pdf') {
  if (!element) throw new Error('No element provided to generate PDF');

  // Ensure element is rendered and visible
  const originalBackground = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  // Use a high scale for better print quality
  const scale = 2;
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  // A4 size in points (pt)
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Dimensions of the canvas image in pt
  const imgWidth = (canvas.width * 72) / (96 * scale) * 1; // convert px->pt (approx)
  const imgHeight = (canvas.height * 72) / (96 * scale) * 1;

  // Fit image width to page width with margins
  const margin = 20;
  const renderWidth = pageWidth - margin * 2;
  const renderHeight = (canvas.height * renderWidth) / canvas.width;

  let position = 0;
  // If content fits in one page
  if (renderHeight <= pageHeight - margin * 2) {
    pdf.addImage(imgData, 'PNG', margin, margin, renderWidth, renderHeight);
  } else {
    // Split image into multiple pages
    let remainingHeight = renderHeight;
    const pageCanvas = document.createElement('canvas');
    const pageCtx = pageCanvas.getContext('2d');

    // Set pageCanvas size to portion of the original canvas
    const ratio = canvas.width / renderWidth;
    const srcPageHeight = Math.floor((pageHeight - margin * 2) * ratio);

    pageCanvas.width = canvas.width;
    pageCanvas.height = srcPageHeight;

    let srcY = 0;
    while (remainingHeight > 0) {
      pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx.drawImage(canvas, 0, srcY, canvas.width, srcPageHeight, 0, 0, canvas.width, srcPageHeight);

      const pageData = pageCanvas.toDataURL('image/png');
      pdf.addImage(pageData, 'PNG', margin, margin, renderWidth, (srcPageHeight / canvas.width) * renderWidth);

      remainingHeight -= srcPageHeight / ratio;
      srcY += srcPageHeight;
      if (remainingHeight > 0) pdf.addPage();
    }
  }

  // restore background
  element.style.backgroundColor = originalBackground || '';

  pdf.save(filename);
}
