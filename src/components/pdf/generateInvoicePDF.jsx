import { pdf } from "@react-pdf/renderer";
import Invoice from "./Invoice";

/**
 * Generate the invoice PDF as a Blob.
 * React-PDF doesn't support "real" browser download; use the returned Blob to upload/email,
 * or createObjectURL(blob) for viewing/downloading.
 *
 * @param {Object} invoiceData - Invoice shape expected by `InvoicePDF`.
 * @returns {Promise<Blob>} PDF blob. For nodemailer: use Buffer.from(await blob.arrayBuffer()).
 */
export const generateInvoicePDF = async (invoiceData) => {
  const blob = await pdf(<Invoice data={invoiceData} />).toBlob();
  return blob;
}
