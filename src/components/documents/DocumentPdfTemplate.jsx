import { forwardRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mergeLiveBrandingForDocuments } from "@/utils/documentPreviewData";
import PaidlyCleanDocument from "@/components/documentPdf/PaidlyCleanDocument";
import { mapHubDocumentPdfData } from "./mapHubDocumentPdfData";

/**
 * Clean & professional sheet for every Documents Hub type.
 * Same layout as invoice and quote previews.
 */
const DocumentPdfTemplate = forwardRef(function DocumentPdfTemplate(
  { doc, workspace, client },
  ref
) {
  const { user: authUser } = useAuth();
  const effectiveUser = useMemo(
    () => mergeLiveBrandingForDocuments(workspace, authUser),
    [workspace, authUser]
  );
  const data = useMemo(
    () => mapHubDocumentPdfData(doc, client, effectiveUser),
    [doc, client, effectiveUser]
  );

  if (!data) return null;

  return (
    <div
      ref={ref}
      data-invoice-pdf-capture="true"
      className="paidly-doc-sheet"
      style={{ background: "#fff" }}
    >
      <PaidlyCleanDocument data={data} />
    </div>
  );
});

DocumentPdfTemplate.displayName = "DocumentPdfTemplate";
export default DocumentPdfTemplate;
