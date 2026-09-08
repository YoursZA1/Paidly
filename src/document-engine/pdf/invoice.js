import { generateInvoicePDF } from "@/components/pdf/generateInvoicePDF";
import {
  createDocumentContext,
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  pdfArtifactFilename,
  toPdfArtifact,
  wrapDocumentEngineError,
} from "@shared/documents/documentEngine.js";

export async function generateInvoiceDocumentPdf(contextOrInput) {
  const context =
    contextOrInput?.documentType === "invoice" && contextOrInput.documentId
      ? contextOrInput
      : createDocumentContext({ documentType: "invoice", ...contextOrInput, record: contextOrInput?.record || contextOrInput?.invoice });
  const invoice = context.record || contextOrInput?.invoice;
  if (!invoice) {
    throw new DocumentEngineError(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND, "Invoice not found");
  }
  try {
    const blob = await generateInvoicePDF({
      invoice,
      client: context.client || contextOrInput?.client,
      user: context.user || contextOrInput?.user,
      bankingDetail: context.bankingDetail || contextOrInput?.bankingDetail || null,
    });
    return toPdfArtifact({
      blob,
      filename: contextOrInput?.filename || pdfArtifactFilename(context),
      context,
    });
  } catch (error) {
    throw wrapDocumentEngineError(
      error,
      DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED,
      "Invoice PDF generation failed"
    );
  }
}
