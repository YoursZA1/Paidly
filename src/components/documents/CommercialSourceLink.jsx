import { Link } from "react-router-dom";
import { createViewDocumentUrl } from "@/utils";

export default function CommercialSourceLink({ quote, invoice }) {
  if (invoice?.source_quote && invoice.source_quote.quote_number) {
    return (
      <p className="text-sm text-muted-foreground">
        Created from Quote →{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={createViewDocumentUrl("quote", invoice.source_quote.id || invoice.source_quote_id)}
        >
          {invoice.source_quote.quote_number}
        </Link>
      </p>
    );
  }

  if (invoice?.source_quote_id && invoice.source_quote_number) {
    return (
      <p className="text-sm text-muted-foreground">
        Created from Quote →{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={createViewDocumentUrl("quote", invoice.source_quote_id)}
        >
          {invoice.source_quote_number}
        </Link>
      </p>
    );
  }

  if (quote?.converted_invoice?.invoice_number) {
    return (
      <p className="text-sm text-muted-foreground">
        Converted →{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={createViewDocumentUrl("invoice", quote.converted_invoice.id)}
        >
          {quote.converted_invoice.invoice_number}
        </Link>
      </p>
    );
  }

  return null;
}
