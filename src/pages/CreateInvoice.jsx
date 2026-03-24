import { Navigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * Canonical invoice creation uses the document-style flow (CreateDocument + DocumentPreview).
 * Preserves query params e.g. ?quoteId=…&client_id=…
 */
export default function CreateInvoice() {
  const { search } = useLocation();
  const target = `${createPageUrl("CreateDocument/invoice")}${search || ""}`;
  return <Navigate to={target} replace />;
}
