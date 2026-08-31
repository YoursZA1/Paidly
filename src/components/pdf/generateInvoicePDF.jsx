import { createRoot } from "react-dom/client";
import DocumentPreview from "@/components/DocumentPreview";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { profileForQuotePreview, recordToStyledPreviewDoc } from "@/utils/documentPreviewData";
import {
  buildInvoiceTemplatePdfCaptureProps,
  safeFormatDate,
} from "@/components/pdf/InvoiceTemplatePdfCapture";
import InvoiceTemplateDocument from "@/components/pdf/InvoiceTemplateDocument";
import { DOCUMENT_TEMPLATE_KEY } from "@/utils/invoiceTemplateData";
import {
  waitForPdfAssets,
  waitForPdfDocumentReady,
} from "@/lib/documentPdf/waitForPdfDocumentReady";

/**
 * Invoice PDF blob using the same DocumentPreview + html2pdf path as {@link generateQuotePDF}.
 *
 * @param {{ invoice: object, client: object, user: object, bankingDetail?: object|null }} params
 * @returns {Promise<Blob>}
 */
export async function generateInvoicePDF({ invoice, client, user, bankingDetail = null }) {
  if (typeof document === "undefined") {
    throw new Error("Invoice PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:210mm;max-width:210mm;z-index:-1;opacity:0;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${invoice?.invoice_number || invoice?.reference_number || "invoice"}.pdf`;

  try {
    const resolvedClient =
      client && typeof client === "object"
        ? client
        : { name: invoice?.client_name || "Client", id: invoice?.client_id };
    const pack = buildInvoiceTemplatePdfCaptureProps(invoice, resolvedClient, user, bankingDetail);

    if (pack.templateKey === DOCUMENT_TEMPLATE_KEY) {
      const profile = profileForQuotePreview(invoice, user);
      const previewDoc = recordToStyledPreviewDoc(invoice, resolvedClient, "invoice", profile);
      root.render(
        <DocumentPreview
          doc={previewDoc}
          docType="invoice"
          clients={[resolvedClient]}
          user={profile}
          bankingDetail={bankingDetail}
          hideStatus
        />
      );
      const el = await waitForPdfDocumentReady(host);
      if (!el) throw new Error("Invoice PDF capture node missing");
      return await generatePdfBlobFromElement(el, filename);
    }

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
