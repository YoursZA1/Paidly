import { createRoot } from "react-dom/client";
import DocumentPreview from "@/components/DocumentPreview";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { profileForQuotePreview, recordToStyledPreviewDoc } from "@/utils/documentPreviewData";

async function waitForImages(container) {
  const imgs = [...container.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalHeight > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 4000);
        })
    )
  );
}

function flushLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * Invoice PDF blob using the same DocumentPreview + html2pdf path as {@link generateQuotePDF}.
 * Avoids multi-page template shells that cause extra/blank pages in html2pdf v0.10.
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
    "position:fixed;left:-12000px;top:0;width:210mm;max-width:210mm;z-index:-1;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${invoice?.invoice_number || invoice?.reference_number || "invoice"}.pdf`;

  try {
    const resolvedClient =
      client && typeof client === "object"
        ? client
        : { name: invoice?.client_name || "Client", id: invoice?.client_id };
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

    await flushLayout();
    const el = host.firstElementChild;
    if (!el) throw new Error("Invoice PDF capture node missing");
    await waitForImages(el);
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
