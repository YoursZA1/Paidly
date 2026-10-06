import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchPublicDocumentPayload } from "@/api/publicDocumentApiClient";
import { typeLabel } from "@/document-engine";
import PaidlyCleanDocument from "@/components/documentPdf/PaidlyCleanDocument";
import { mapHubDocumentPdfData } from "@/components/documents/mapHubDocumentPdfData";
import { PublicPortalMessage } from "@/components/documents/PublicDocumentPortal";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { waitUntilElementReady } from "@/lib/documentPdf/waitForPdfDocumentReady";
import { Loader2 } from "lucide-react";

export default function DocumentPDF() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const shareToken = params.get("token");
  const autoDownload = params.get("download") === "true";
  const sheetRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareToken) {
      setIsLoading(false);
      setError("This link does not match a document.");
      return undefined;
    }
    let cancelled = false;
    fetchPublicDocumentPayload(shareToken)
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "This document could not be opened.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const doc = payload?.document || null;
  const data = useMemo(
    () => (doc ? mapHubDocumentPdfData(doc, payload?.client, payload?.owner) : null),
    [doc, payload]
  );
  const label = typeLabel(doc?.type) || "Document";

  useEffect(() => {
    if (!autoDownload || !data || !sheetRef.current) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || !sheetRef.current) return;
      try {
        const ready = await waitUntilElementReady(sheetRef.current);
        const filename = `${doc.document_number || label}.pdf`;
        const blob = await generatePdfBlobFromElement(ready || sheetRef.current, filename);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        /* The page still shows the document if the file cannot be saved. */
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoDownload, data, doc, label]);

  if (isLoading) {
    return (
      <PublicPortalMessage icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Preparing PDF">
        <p className="text-center text-sm text-slate-500">Fetching the document…</p>
      </PublicPortalMessage>
    );
  }

  if (error || !data) {
    return (
      <PublicPortalMessage title="Document not found">
        <p className="text-center text-sm text-slate-500">{error || "This link does not match a document."}</p>
      </PublicPortalMessage>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef1f4] px-3 py-6">
      <div ref={sheetRef} className="mx-auto max-w-[210mm] bg-white shadow-sm">
        <PaidlyCleanDocument data={data} />
      </div>
    </div>
  );
}
