import { createRoot } from "react-dom/client";
import DocumentPreview from "@/components/DocumentPreview";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { profileForQuotePreview, recordToStyledPreviewDoc } from "@/utils/documentPreviewData";
import { waitForPdfDocumentReady } from "@/lib/documentPdf/waitForPdfDocumentReady";

/**
 * Generate a quote PDF blob using the same DocumentPreview used by QuotePDF page.
 * @param {{ quote: object, client: object, user: object, bankingDetail?: object|null }} params
 * @returns {Promise<Blob>}
 */
export async function generateQuotePDF({ quote, client, user, bankingDetail = null }) {
  if (typeof document === "undefined") {
    throw new Error("Quote PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:210mm;max-width:210mm;z-index:-1;opacity:0;pointer-events:none;";
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
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
