import { createRoot } from "react-dom/client";
import DocumentPreview from "@/components/DocumentPreview";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { profileForQuotePreview, recordToStyledPreviewDoc } from "@/utils/documentPreviewData";
import { waitForPdfDocumentReady } from "@/lib/documentPdf/waitForPdfDocumentReady";

/**
 * Quote PDF blob. Same DocumentPreview as the public page, the in-app quote, and Download PDF.
 *
 * @param {{ quote: object, client: object, user: object, bankingDetail?: object|null, scale?: number, quality?: number }} params
 * @returns {Promise<Blob>}
 */
export async function generateQuotePDF({ quote, client, user, bankingDetail = null, scale, quality } = {}) {
  if (typeof document === "undefined") {
    throw new Error("Quote PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // html2canvas paints a blank page when an ancestor has opacity 0 or sits behind the page.
  // Keep this host opaque and in the viewport, under any open dialog.
  host.style.cssText =
    "position:fixed;left:0;top:0;width:210mm;max-width:210mm;opacity:1;z-index:1;pointer-events:none;background:#ffffff;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${quote?.quote_number || "quote"}.pdf`;

  try {
    const resolvedClient = client || { name: quote?.client_name || "Client", id: quote?.client_id };
    const profile = profileForQuotePreview(quote, user);
    const previewDoc = recordToStyledPreviewDoc(quote, resolvedClient, "quote", profile);

    root.render(
      <DocumentPreview
        doc={previewDoc}
        docType="quote"
        clients={[resolvedClient]}
        user={profile}
        bankingDetail={bankingDetail}
        hideStatus
      />
    );

    const el = await waitForPdfDocumentReady(host);
    if (!el) throw new Error("Quote PDF capture node missing");
    return await generatePdfBlobFromElement(el, filename, {
      ...(scale ? { scale } : {}),
      ...(quality ? { quality } : {}),
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
