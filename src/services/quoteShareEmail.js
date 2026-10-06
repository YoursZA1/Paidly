import { createDocumentContext } from "@shared/documents/documentEngine.js";
import { generateQuoteDocumentPdf } from "@/document-engine/pdf/quote";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read the quote PDF."));
    reader.readAsDataURL(blob);
  });
}

function pdfFilename(quote) {
  const number = String(quote?.quote_number || "quote").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `Quote-${number || "quote"}.pdf`;
}

/**
 * Render the quote with the same PDF engine as the quote preview, for the share email attachment.
 */
export async function buildQuotePdfAttachment({ quote, client, user }) {
  if (!quote?.id) throw new Error("Quote is missing.");
  let record = quote;
  const { Quote } = await import("@/api/entities");
  const full = await Quote.get(record.id);
  if (full) {
    record = {
      ...record,
      ...full,
      items: full.items || record.items || [],
      public_share_token: record.public_share_token || full.public_share_token,
    };
  }

  let bankingDetail = null;
  const bankingId = String(record.banking_detail_id || "").trim();
  if (bankingId) {
    try {
      const { BankingDetail } = await import("@/api/entities");
      bankingDetail = await BankingDetail.get(bankingId);
    } catch {
      bankingDetail = null;
    }
  }

  const resolvedClient = client || {
    id: record.client_id,
    name: record.client_name || "Client",
  };
  const context = createDocumentContext({
    documentType: "quote",
    documentId: record.id,
    businessId: record.org_id,
    clientId: resolvedClient.id || record.client_id,
    documentNumber: record.quote_number,
    record,
    client: resolvedClient,
    user: user || null,
    bankingDetail,
  });
  let artifact = await generateQuoteDocumentPdf({ ...context, pdfScale: 1.5, pdfQuality: 0.82 });
  let pdfBase64 = await blobToBase64(artifact.blob);
  if (pdfBase64 && pdfBase64.length > 2_800_000) {
    artifact = await generateQuoteDocumentPdf({ ...context, pdfScale: 1, pdfQuality: 0.7 });
    pdfBase64 = await blobToBase64(artifact.blob);
  }
  if (!pdfBase64) throw new Error("Quote PDF generation failed.");
  return {
    pdfBase64,
    pdfFilename: artifact.filename || pdfFilename(record),
  };
}
