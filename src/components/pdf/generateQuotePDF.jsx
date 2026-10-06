import { pdf } from "@react-pdf/renderer";
import Invoice from "@/components/pdf/Invoice";
import { mapQuotePdfData } from "@/components/pdf/mapInvoicePdfData";

/**
 * Quote PDF file used for the email attachment and every Download PDF action.
 * Vector text, same layout. A screen capture of the preview is a photo of the page
 * and comes out soft, with the footer cut off.
 *
 * @param {{ quote: object, client: object, user: object, bankingDetail?: object|null }} params
 * @returns {Promise<Blob>}
 */
export async function generateQuotePDF({ quote, client, user, bankingDetail = null } = {}) {
  const resolvedClient =
    client && typeof client === "object"
      ? client
      : { name: quote?.client_name || "Client", id: quote?.client_id };
  const data = mapQuotePdfData(quote, resolvedClient, user, bankingDetail);
  try {
    return await pdf(<Invoice data={data} currency={data.currency} />).toBlob();
  } catch (error) {
    if (!data.logo_url) throw error;
    return pdf(<Invoice data={{ ...data, logo_url: "" }} currency={data.currency} />).toBlob();
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadQuotePdfBlob(blob, filename = "quote.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
