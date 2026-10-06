import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPublicDocumentPayload } from "@/api/publicDocumentApiClient";
import { isFinancialType, typeLabel } from "@/document-engine";
import PaidlyCleanDocument from "@/components/documentPdf/PaidlyCleanDocument";
import { mapHubDocumentPdfData } from "@/components/documents/mapHubDocumentPdfData";
import PublicDocumentPortal, {
  PublicDocumentSheet,
  PublicPortalMessage,
} from "@/components/documents/PublicDocumentPortal";
import { formatCurrency } from "@/components/CurrencySelector";
import { createPageUrl } from "@/utils";

export default function PublicHubDocument() {
  const location = useLocation();
  const shareToken = new URLSearchParams(location.search).get("token");
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const next = await fetchPublicDocumentPayload(shareToken);
      setPayload(next);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Could not load this document. Please check the link and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    if (shareToken) load();
    else {
      setIsLoading(false);
      setError("This link does not match a document.");
    }
  }, [load, shareToken]);

  const doc = payload?.document || null;
  const data = useMemo(
    () => (doc ? mapHubDocumentPdfData(doc, payload?.client, payload?.owner) : null),
    [doc, payload]
  );

  if (isLoading) {
    const label = "document";
    return (
      <PublicPortalMessage icon={<Loader2 className="h-8 w-8 animate-spin" />} title={`Loading ${label}`}>
        <p className="text-center text-sm text-slate-500">Fetching the document…</p>
      </PublicPortalMessage>
    );
  }

  if (error || !doc || !data) {
    return (
      <PublicPortalMessage title="This document could not be opened">
        <p className="text-center text-sm text-slate-500">{error || "This link does not match a document."}</p>
      </PublicPortalMessage>
    );
  }

  const label = typeLabel(doc.type) || "Document";
  const financial = isFinancialType(doc.type);
  const currency = doc.currency || payload?.owner?.currency || "ZAR";
  const pdfHref = `${createPageUrl("DocumentPDF")}?token=${encodeURIComponent(shareToken)}&download=true`;

  return (
    <PublicDocumentPortal
      companyName={payload?.owner?.company_name || data.issuer?.name || ""}
      documentLabel={label}
      documentNumber={doc.document_number}
      summary={doc.title || ""}
      amountLabel={financial ? "Total" : data.issuedLabel || "Effective"}
      amount={financial ? formatCurrency(doc.total_amount, currency) : data.issuedDateFormatted || ""}
      meta={
        data.dueDateFormatted
          ? `${data.dueLabel || "Due"} ${data.dueDateFormatted}`
          : ""
      }
      actions={
        <Button variant="outline" className="gap-2 border-slate-200 bg-white" asChild>
          <a href={pdfHref} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" />
            <span className="sm:hidden">PDF</span>
            <span className="hidden sm:inline">Download PDF</span>
          </a>
        </Button>
      }
    >
      <PublicDocumentSheet>
        <div className="overflow-x-auto p-3 sm:p-6">
          <PaidlyCleanDocument data={data} />
        </div>
      </PublicDocumentSheet>
    </PublicDocumentPortal>
  );
}
