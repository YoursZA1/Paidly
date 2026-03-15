import { pdf } from "@react-pdf/renderer";
import InvoiceEmailPDF from "./InvoiceEmailPDF";

/**
 * Generate the invoice PDF as a Blob (for email attachments or download).
 * @param {Object} invoiceData - Shape: { brand, address, number, items: [{ description, qty, price, total }], subtotal, total, currency?, company?: { logo: string }, logo_url?: string, owner_logo_url?: string }
 *   Use company.logo, logo_url, or owner_logo_url for the header logo in the PDF.
 * @param {{ currency?: string }} [options] - Optional. currency defaults to "ZAR".
 * @returns {Promise<Blob>} PDF blob. For nodemailer: use as buffer with Buffer.from(await blob.arrayBuffer()).
 */
export async function generateInvoicePDF(invoiceData, options = {}) {
  const currency = options.currency ?? invoiceData.currency ?? "ZAR";
  const blob = await pdf(
    <InvoiceEmailPDF invoice={invoiceData} currency={currency} />
  ).toBlob();

  return blob;
}
