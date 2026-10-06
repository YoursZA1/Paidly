import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchPublicDocumentPayload, signPublicDocument } from "@/api/publicDocumentApiClient";
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
  const [signOpen, setSignOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const next = await fetchPublicDocumentPayload(shareToken);
      setPayload(next);
      setSignerEmail(next?.client?.email || "");
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
  const signState = payload?.signing || { required: false, canSign: false, signed: false, signedName: "" };

  const submitSignature = async () => {
    setSigning(true);
    setSignError("");
    try {
      const result = await signPublicDocument({ shareToken, signerName, signerEmail });
      setPayload((prev) => ({
        ...prev,
        document: { ...prev.document, ...(result?.document || {}) },
        signing: result?.signing || { required: true, canSign: false, signed: true, signedName: signerName },
      }));
      setSignOpen(false);
    } catch (err) {
      setSignError(err?.message || "Could not sign this document.");
    } finally {
      setSigning(false);
    }
  };

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
        <>
          <Button variant="outline" className="gap-2 border-slate-200 bg-white" asChild>
            <a href={pdfHref} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Download PDF</span>
            </a>
          </Button>
          {signState.canSign ? (
            <Button className="gap-2" onClick={() => { setSignError(""); setSignOpen(true); }}>
              <PenLine className="h-4 w-4" />
              Sign
            </Button>
          ) : null}
        </>
      }
    >
      {signState.signed ? (
        <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          Signed{signState.signedName ? ` by ${signState.signedName}` : ""}.
        </p>
      ) : null}
      <PublicDocumentSheet>
        <div className="overflow-x-auto p-3 sm:p-6">
          <PaidlyCleanDocument data={data} />
        </div>
      </PublicDocumentSheet>
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign this {label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Type your name. That name is your signature on this {label.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
              placeholder="Your full name"
              autoComplete="name"
            />
            <div
              className="min-h-16 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-2xl text-slate-900"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
            >
              {signerName.trim() || "Your signature"}
            </div>
            <Input
              type="email"
              value={signerEmail}
              onChange={(event) => setSignerEmail(event.target.value)}
              placeholder="Email this was sent to"
              autoComplete="email"
            />
            {signError ? <p className="text-sm text-red-600">{signError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)} disabled={signing}>
              Cancel
            </Button>
            <Button onClick={submitSignature} disabled={signing || signerName.trim().length < 2}>
              {signing ? "Signing…" : "Sign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicDocumentPortal>
  );
}
