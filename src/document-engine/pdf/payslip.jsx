import { createRoot } from "react-dom/client";
import { format, isValid, parseISO } from "date-fns";
import PayslipDocument from "@/components/payslips/PayslipDocument";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { waitForPdfAssets } from "@/lib/documentPdf/waitForPdfDocumentReady";
import {
  createDocumentContext,
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  pdfArtifactFilename,
  toPdfArtifact,
  wrapDocumentEngineError,
} from "@shared/documents/documentEngine.js";

function safeFormatDate(dateStr) {
  if (!dateStr) return "N/A";
  const date = parseISO(dateStr);
  return isValid(date) ? format(date, "MMMM d, yyyy") : "N/A";
}

/**
 * Payslip PDF blob using the existing PayslipDocument template.
 * Does not recalculate payroll figures.
 */
export async function generatePayslipPDF({ payslip, user }) {
  if (typeof document === "undefined") {
    throw new Error("Payslip PDF generation requires a browser environment.");
  }
  if (!payslip) {
    throw new DocumentEngineError(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND, "Payslip not found");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:210mm;max-width:210mm;z-index:-1;opacity:0;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${payslip?.payslip_number || "payslip"}.pdf`;
  const payDate = safeFormatDate(payslip.pay_date);
  const payPeriodLabel = `${safeFormatDate(payslip.pay_period_start)} - ${safeFormatDate(payslip.pay_period_end)}`;

  try {
    root.render(
      <PayslipDocument
        payslip={payslip}
        user={user}
        payDate={payDate}
        payPeriodLabel={payPeriodLabel}
        className="rounded-none"
      />
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = host.firstElementChild;
    if (!el) throw new Error("Payslip PDF capture node missing");
    await waitForPdfAssets(el);
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
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
  const payslip = context.record || contextOrInput?.payslip;
  if (!payslip) {
    throw new DocumentEngineError(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND, "Payslip not found");
  }
  try {
    const blob = await generatePayslipPDF({
      payslip,
      user: context.user || contextOrInput?.user,
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
      "Payslip PDF generation failed"
    );
  }
}
