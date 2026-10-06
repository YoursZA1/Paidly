import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPublicDocumentPayload } from "@/api/publicDocumentApiClient";
import { isFinancialType, typeLabel } from "@/document-engine";
import PaidlyCleanDocument from "@/components/documentPdf/PaidlyCleanDocument";
import { mapHubDocumentPdfData } from "@/components/documents/mapHubDocumentPdfData";
import PublicDocumentPortal, {
  PublicDocumentSheet,
  PublicPortalMessage,
  formatPortalDate,
} from "@/components/documents/PublicDocumentPortal";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { formatCurrency } from "@/components/CurrencySelector";

export default function PublicHubDocument() {
  const location = useLocation();
  const shareToken = new URLSearchParams(location.search).get("token");
  const sheetRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await fetchPublicDocumentPayload(shareToken);
      setPayload(next);
    } catch {
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    if (shareToken) load();
    else setIsLoading(false);
  }, [load, shareToken]);

  const doc = payload?.document || null;
  const data = useMemo(
    () => (doc ? mapHubDocumentPdfData(doc, payload?.client, payload?.owner) : null),
    [doc, payload]
  );
  const label = typeLabel(doc?.type) || "Document";
  const financial = doc ? isFinancialType(doc.type) : false;
  const currency = doc?.currency || payload?.owner?.currency || "ZAR";
  const due = formatPortalDate(doc?.due_date || doc?.valid_until);

  const downloadPdf = async () => {
    if (!sheetRef.current || !doc) return;
    setDownloading(true);
    try {
      const filename = `${doc.document_number || label}.pdf`;
      const blob = await generatePdfBlobFromElement(sheetRef.current, filename);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <PublicPortalMessage title={`Loading ${label.toLowerCase()}`}>
        <p className="text-center text-sm text-slate-500">Fetching the document…</p>
      </PublicPortalMessage>
    );
  }

  if (!doc || !data) {
    return (
      <PublicPortalMessage title="Document not found">
        <p className="text-center text-sm text-slate-500">This link does not match a document.</p>
      </PublicPortalMessage>
    );
  }

  return (
    <PublicDocumentPortal
      companyName={payload?.owner?.company_name || data.issuer?.name || ""}
      documentLabel={label}
      documentNumber={doc.document_number}
      summary={doc.title || ""}
      amountLabel="Total"
      amount={financial ? formatCurrency(doc.total_amount, currency) : ""}
      meta={due ? `Due ${due}` : ""}
      actions={
        <Button
          variant="outline"
          className="gap-2 border-slate-200 bg-white"
          onClick={downloadPdf}
          disabled={downloading}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{downloading ? "Preparing…" : "Download PDF"}</span>
          <span className="sm:hidden">PDF</span>
        </Button>
      }
    >
      <PublicDocumentSheet>
        <div ref={sheetRef}>
          <PaidlyCleanDocument data={data} />
        </div>
      </PublicDocumentSheet>
    </PublicDocumentPortal>
  );
}
