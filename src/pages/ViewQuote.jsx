import { Navigate, useLocation } from "react-router-dom";
import { createViewDocumentUrl } from "@/utils";

/**
 * Canonical quote view matches invoice document view (ViewDocument + DocumentPreview).
 * Legacy ?id= URLs redirect to /ViewDocument/quote/:id
 */
export default function ViewQuote() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get("id");
  if (!id) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Missing quote id. Open a quote from the Quotes list.
      </div>
    );
  }
  return <Navigate to={createViewDocumentUrl("quote", id)} replace />;
}
