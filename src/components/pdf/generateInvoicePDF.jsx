import { createRoot } from "react-dom/client";
import InvoiceTemplatePdfCapture from "./InvoiceTemplatePdfCapture";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";

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
 * PDF blob using the same HTML templates as the invoice preview (Classic / Modern / Minimal / Bold).
 * Browser only — uses html2pdf.js on a hidden render tree.
 *
 * @param {{ invoice: object, client: object, user: object, bankingDetail?: object|null }} params
 * @returns {Promise<Blob>}
 */
export async function generateInvoicePDF({ invoice, client, user, bankingDetail = null }) {
  if (typeof document === "undefined") {
    throw new Error("Template PDF generation requires a browser environment.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:210mm;max-width:210mm;z-index:-1;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  const filename = `${invoice?.invoice_number || invoice?.reference_number || "invoice"}.pdf`;

  try {
    root.render(
      <InvoiceTemplatePdfCapture
        invoice={invoice}
        client={client}
        user={user}
        bankingDetail={bankingDetail}
      />
    );
    await flushLayout();
    const el = host.querySelector("[data-invoice-pdf-capture]");
    if (!el) throw new Error("Invoice PDF capture node missing");
    await waitForImages(el);
    return await generatePdfBlobFromElement(el, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}
