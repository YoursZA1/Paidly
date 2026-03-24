import { Navigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * Canonical quote creation uses the same document flow as invoices (CreateDocument + LineItemsEditor + catalog).
 * Preserves query params e.g. ?client_id=…&templateId=…&duplicateLast=1
 */
export default function CreateQuote() {
  const { search } = useLocation();
  const target = `${createPageUrl("CreateDocument/quote")}${search || ""}`;
  return <Navigate to={target} replace />;
}
