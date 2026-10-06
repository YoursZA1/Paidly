import { createDocumentContext } from "@shared/documents/documentEngine.js";
import { generateInvoiceDocumentPdf } from "@/document-engine/pdf/invoice";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read the invoice PDF."));
    reader.readAsDataURL(blob);
  });
}

function pdfFilename(invoice) {
  const number = String(invoice?.invoice_number || "invoice").replace(/[^A-Za-z0-9._-]+/g, "-");
  return `Invoice-${number || "invoice"}.pdf`;
}

/**
 * Same invoice PDF as Download PDF, attached to the share email.
 */
export async function buildInvoicePdfAttachment({ invoice, client, user }) {
  if (!invoice?.id) throw new Error("Invoice is missing.");
  let record = invoice;
  const { Invoice } = await import("@/api/entities");
  const full = await Invoice.get(record.id);
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
    documentType: "invoice",
    documentId: record.id,
    businessId: record.org_id,
    clientId: resolvedClient.id || record.client_id,
    documentNumber: record.invoice_number || record.reference_number,
    record,
    client: resolvedClient,
    user: user || null,
    bankingDetail,
  });
  const artifact = await generateInvoiceDocumentPdf(context);
  const pdfBase64 = await blobToBase64(artifact.blob);
  if (!pdfBase64) throw new Error("Invoice PDF generation failed.");
  return {
    pdfBase64,
    pdfFilename: artifact.filename || pdfFilename(record),
  };
}
