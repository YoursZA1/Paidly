import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { recordToStyledPreviewDoc, profileForQuotePreview } from "@/utils/documentPreviewData";
import { parseDocumentBrandHex } from "@/utils/documentBrandColors";
import { useParams, useNavigate } from "react-router-dom";
import { Invoice, Quote, Client, User, BankingDetail } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Send, Loader2, Edit, ArrowRightSquare } from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import StatusBadge from "@/components/StatusBadge";
import SendEmailDialog from "@/components/SendEmailDialog";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { withTimeoutRetry, ENTITY_GET_TIMEOUT_MS } from "@/utils/fetchWithTimeout";
import { downloadDocumentPreviewFromElement, waitForPreviewPaint } from "@/utils/documentPreviewPdf";

const INVOICE_STATUSES = [
  "draft",
  "sending",
  "preparing",
  "sent",
  "viewed",
  "pending",
  "paid",
  "partial_paid",
  "overdue",
  "cancelled",
];

const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];

function normalizeDocType(raw) {
  const t = String(raw || "").toLowerCase();
  if (t === "quote" || t === "quotes") return "quote";
  if (t === "invoice" || t === "invoices") return "invoice";
  return null;
}

export default function ViewDocument() {
  const { docType: docTypeParam, id } = useParams();
  const docType = normalizeDocType(docTypeParam);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [record, setRecord] = useState(null);
  const [client, setClient] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bankingDetail, setBankingDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const previewPdfRef = useRef(null);

  const loadDocument = useCallback(async () => {
    if (!id || !docType) {
      setLoading(false);
      setRecord(null);
      setBankingDetail(null);
      return;
    }
    setLoading(true);
    try {
      const entity =
        docType === "invoice"
          ? await withTimeoutRetry(() => Invoice.get(id), ENTITY_GET_TIMEOUT_MS, 2)
          : await withTimeoutRetry(() => Quote.get(id), ENTITY_GET_TIMEOUT_MS, 2);

      if (!entity) {
        setRecord(null);
        setClient(null);
        setBankingDetail(null);
        return;
      }

      const withItems = {
        ...entity,
        items: Array.isArray(entity.items) ? entity.items : [],
      };

      let clientData = null;
      if (withItems.client_id) {
        try {
          clientData = await withTimeoutRetry(() => Client.get(withItems.client_id), ENTITY_GET_TIMEOUT_MS, 1);
        } catch {
          clientData = null;
        }
      }

      let userProfile = null;
      try {
        userProfile = await withTimeoutRetry(() => User.me(), ENTITY_GET_TIMEOUT_MS, 1);
      } catch {
        userProfile = null;
      }

      let bankingRow = null;
      const bid = withItems.banking_detail_id && String(withItems.banking_detail_id).trim();
      if (bid) {
        try {
          bankingRow = await withTimeoutRetry(() => BankingDetail.get(bid), ENTITY_GET_TIMEOUT_MS, 1);
        } catch {
          bankingRow = null;
        }
      }

      setRecord(withItems);
      setClient(clientData);
      setProfile(userProfile);
      setBankingDetail(bankingRow);
    } catch (e) {
      console.error("ViewDocument load:", e);
      setRecord(null);
      setBankingDetail(null);
      toast({
        title: "Could not load document",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, docType, toast]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const updateStatus = async (status) => {
    if (!record?.id || !docType) return;
    try {
      if (docType === "invoice") {
        await Invoice.update(record.id, { status });
      } else {
        await Quote.update(record.id, { status });
      }
      setRecord((prev) => (prev ? { ...prev, status } : prev));
      toast({ title: "Status updated", description: status, variant: "success" });
    } catch (e) {
      toast({
        title: "Update failed",
        description: e?.message || "Could not change status.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = async () => {
    if (!record?.id || !docType) return;
    setDownloading(true);
    try {
      await waitForPreviewPaint();
      const el = previewPdfRef.current;
      if (!el) {
        toast({
          title: "Preview not ready",
          description: "Try Download PDF again in a moment.",
          variant: "destructive",
        });
        return;
      }
      const numberRaw =
        docType === "invoice" ? record.invoice_number : record.quote_number;
      await downloadDocumentPreviewFromElement(el, docType, numberRaw, { doc: previewDoc });
      toast({
        title: "PDF downloaded",
        description: "Saved to your downloads folder.",
        variant: "success",
      });
    } catch (e) {
      console.error("ViewDocument PDF:", e);
      toast({
        title: "Could not create PDF",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const listHref = docType === "quote" ? createPageUrl("Quotes") : createPageUrl("Invoices");
  const statusOptions = useMemo(() => {
    if (!docType) return [];
    const base = docType === "quote" ? [...QUOTE_STATUSES] : [...INVOICE_STATUSES];
    const s = record?.status;
    if (s && !base.includes(s)) base.push(s);
    return base;
  }, [docType, record?.status]);
  const currentStatus = record?.status || "draft";

  if (!docType) {
    return (
      <div className="text-center py-16 px-4">
        <h2 className="text-xl font-semibold mb-2">Invalid document type</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Use <code className="text-xs bg-muted px-1 rounded">/ViewDocument/invoice/…</code> or{" "}
          <code className="text-xs bg-muted px-1 rounded">/ViewDocument/quote/…</code>.
        </p>
        <Button variant="outline" onClick={() => navigate(createPageUrl("Dashboard"))}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-16 px-4">
        <h2 className="text-xl font-semibold mb-2">Document not found</h2>
        <Button variant="outline" onClick={() => navigate(listHref)}>
          Go back
        </Button>
      </div>
    );
  }

  const previewProfile =
    docType === "quote"
      ? profileForQuotePreview(record, profile)
      : {
          ...(profile || {}),
          document_brand_primary:
            parseDocumentBrandHex(record.document_brand_primary) != null
              ? record.document_brand_primary
              : profile?.document_brand_primary,
          document_brand_secondary:
            parseDocumentBrandHex(record.document_brand_secondary) != null
              ? record.document_brand_secondary
              : profile?.document_brand_secondary,
        };

  const previewDoc = recordToStyledPreviewDoc(record, client, docType, previewProfile);
  const titleNumber = previewDoc.number || record.id;
  const displayName = client?.name || previewDoc.client_name || "Client";

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(listHref)} aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight capitalize truncate">
                {docType} #{titleNumber}
              </h1>
              <StatusBadge status={record.status} variant={docType === "quote" ? "quote" : "invoice"} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{displayName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {docType === "quote" && record?.id && (
            <>
              {(record.status === "sent" || record.status === "accepted") && (
                <Button
                  className="gap-2 bg-primary"
                  onClick={() =>
                    navigate(`${createPageUrl("CreateDocument/invoice")}?quoteId=${encodeURIComponent(record.id)}`)
                  }
                >
                  <ArrowRightSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Convert to invoice</span>
                  <span className="sm:hidden">To invoice</span>
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate(`${createPageUrl("EditQuote")}?id=${encodeURIComponent(record.id)}`)}
              >
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </>
          )}
          <Select value={currentStatus} onValueChange={updateStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setEmailOpen(true)} className="gap-2">
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Email</span>
          </Button>
          <Button onClick={downloadPDF} disabled={downloading} className="gap-2">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <DocumentPreview
          ref={previewPdfRef}
          doc={previewDoc}
          docType={docType}
          clients={client ? [client] : []}
          user={previewProfile}
          bankingDetail={bankingDetail}
          hideStatus={downloading}
        />
      </div>

      <SendEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        docType={docType}
        record={record}
        onRecordUpdate={(next) => setRecord((prev) => (prev ? { ...prev, ...next } : prev))}
      />
    </div>
  );
}
