import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge";
import QuoteStatusBadge from "@/components/quote/QuoteStatusBadge";

/**
 * Thin wrapper so document views can show the correct pill for invoices vs quotes.
 */
export default function StatusBadge({ status, variant = "invoice" }) {
  if (variant === "quote") {
    return <QuoteStatusBadge status={status} />;
  }
  return <InvoiceStatusBadge status={status} />;
}
