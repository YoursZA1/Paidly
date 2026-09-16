import { createRoot } from "react-dom/client";
import { pdf } from "@react-pdf/renderer";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import {
  buildInvoiceTemplatePdfCaptureProps,
  safeFormatDate,
} from "@/components/pdf/InvoiceTemplatePdfCapture";
import InvoiceTemplateDocument from "@/components/pdf/InvoiceTemplateDocument";
import Invoice from "@/components/pdf/Invoice";
import { mapInvoicePdfData } from "@/components/pdf/mapInvoicePdfData";
import { DOCUMENT_TEMPLATE_KEY } from "@/utils/invoiceTemplateData";
import { waitForPdfAssets } from "@/lib/documentPdf/waitForPdfDocumentReady";

/**
 * Invoice PDF blob.
 * - Default (`document`) template → premium @react-pdf InvoiceDocument
 * - Legacy HTML templates → DocumentPreview/Template + html2pdf (unchanged)
 *
 * @param {{ invoice: object, client: object, user: object, bankingDetail?: object|null }} params
 * @returns {Promise<Blob>}
 */
export async function generateInvoicePDF({ invoice, client, user, bankingDetail = null }) {
  const resolvedClient =
    client && typeof client === "object"
      ? client
      : { name: invoice?.client_name || "Client", id: invoice?.client_id };
  const pack = buildInvoiceTemplatePdfCaptureProps(
    invoice,
    resolvedClient,
    user,
    bankingDetail
  );

  if (pack.templateKey === DOCUMENT_TEMPLATE_KEY) {
    const data = mapInvoicePdfData(invoice, resolvedClient, user, bankingDetail);
    return pdf(<Invoice data={data} currency={data.currency} />).toBlob();
  }

  if (typeof document === "undefined") {
    throw new Error("Legacy invoice PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:210mm;max-width:210mm;z-index:-1;opacity:0;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${invoice?.invoice_number || invoice?.reference_number || "invoice"}.pdf`;

  try {
    root.render(
      <InvoiceTemplateDocument
        TemplateComponent={pack.TemplateComponent}
        invoice={pack.templateInvoice}
        client={pack.clientForTemplate}
        user={pack.resolvedUser}
        bankingDetail={pack.bankingForTemplate}
        userCurrency={pack.userCurrency}
        safeFormatDate={safeFormatDate}
      />
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el =
      host.querySelector("[data-invoice-pdf-capture='true']") || host.firstElementChild;
    if (!el) throw new Error("Invoice PDF capture node missing");
    await waitForPdfAssets(el);
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * Trigger a browser download for an invoice PDF blob.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadInvoicePdfBlob(blob, filename = "invoice.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
