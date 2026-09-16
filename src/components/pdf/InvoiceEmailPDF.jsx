import InvoiceDocument from "./invoice/InvoiceDocument";

/**
 * Email / attachment PDF — same premium document as downloads.
 * Expects mapped invoice data (mapInvoicePdfData / mapToInvoiceData).
 */
export default function InvoiceEmailPDF({ invoice, currency = "ZAR" }) {
  return (
    <InvoiceDocument
      invoice={invoice}
      currency={currency || invoice?.currency || "ZAR"}
    />
  );
}
