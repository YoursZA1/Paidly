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
    "position:fixed;left:-12000px;top:0;width:210mm;max-width:210mm;z-index:-1;pointer-events:none;";
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

    await flushLayout();
    const el = host.firstElementChild;
    if (!el) throw new Error("Quote PDF capture node missing");
    await waitForImages(el);
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}

