import { generateQuotePDF } from "@/components/pdf/generateQuotePDF";
import {
  createDocumentContext,
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  pdfArtifactFilename,
  toPdfArtifact,
  wrapDocumentEngineError,
} from "@shared/documents/documentEngine.js";

export async function generateQuoteDocumentPdf(contextOrInput) {
  const context =
    contextOrInput?.documentType === "quote" && contextOrInput.documentId
      ? contextOrInput
      : createDocumentContext({ documentType: "quote", ...contextOrInput, record: contextOrInput?.record || contextOrInput?.quote });
  const quote = context.record || contextOrInput?.quote;
  if (!quote) {
    throw new DocumentEngineError(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND, "Quote not found");
  }
  try {
    const blob = await generateQuotePDF({
      quote,
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
      "Quote PDF generation failed"
    );
  }
}
