import { pdf } from "@react-pdf/renderer";
import Invoice from "@/components/pdf/Invoice";
import { mapQuotePdfData } from "@/components/pdf/mapInvoicePdfData";

/**
 * Quote PDF blob for email and download.
 * Uses the same @react-pdf document as invoices. A screen capture of the preview
 * was producing a blank page once the company logo was on the quote.
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
