import {
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  createDocumentContext,
} from "@shared/documents/documentEngine.js";
import { generateInvoiceDocumentPdf } from "./invoice";
import { generateQuoteDocumentPdf } from "./quote";
import { generatePayslipDocumentPdf } from "./payslip";

const GENERATORS = {
  invoice: generateInvoiceDocumentPdf,
  quote: generateQuoteDocumentPdf,
  payslip: generatePayslipDocumentPdf,
};

/**
 * Generate a PDF artifact for a commercial document.
 * Adapters wrap existing invoice/quote/payslip renderers — they do not email.
 *
 * @param {object} contextOrInput - `createDocumentContext` result or a typed payload
 */
export async function generateDocumentPdf(contextOrInput = {}) {
  const context = contextOrInput.documentType && contextOrInput.documentId
    ? contextOrInput
    : createDocumentContext(contextOrInput);
  const generate = GENERATORS[context.documentType];
  if (!generate) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.TEMPLATE_MISSING,
      `No PDF renderer for ${context.documentType}`
    );
  }
  return generate(context);
}

export { generateInvoiceDocumentPdf } from "./invoice";
export { generateQuoteDocumentPdf } from "./quote";
export { generatePayslipDocumentPdf, generatePayslipPDF } from "./payslip";
