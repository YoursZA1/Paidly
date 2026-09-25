import {
  createDocumentContext,
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  wrapDocumentEngineError,
} from "@shared/documents/documentEngine.js";

/**
 * Payslip PDFs are generated and encrypted on the server only (server/src/payroll/payslipPdf.js):
 * download via GET /api/payroll/payslips/:id/pdf (downloadPayslipPdf in PayrollApiService), email via
 * the payroll send routes. A PDF built in the browser would be unencrypted, so these refuse.
 */
export async function generatePayslipPDF() {
  throw new DocumentEngineError(
    DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED,
    "Payslip PDFs are generated securely on the server. Use Download on the payslip."
  );
}

export async function generatePayslipDocumentPdf(contextOrInput) {
  const context =
    contextOrInput?.documentType === "payslip" && contextOrInput.documentId
      ? contextOrInput
      : createDocumentContext({
          documentType: "payslip",
          ...contextOrInput,
          record: contextOrInput?.record || contextOrInput?.payslip,
        });
  try {
    return await generatePayslipPDF(context);
  } catch (error) {
    throw wrapDocumentEngineError(error, DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED, "Payslip PDF generation failed");
  }
}
