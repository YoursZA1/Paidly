import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { recordToStyledPreviewDoc, profileForQuotePreview } from "@/utils/documentPreviewData";
import { parseDocumentBrandHex } from "@/utils/documentBrandColors";
import { useParams, useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { Invoice, Quote, Client, User, BankingDetail } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Send, Loader2, Edit, ArrowRightSquare } from "lucide-react";
import DocumentPreview from "@/components/DocumentPreview";
import DocumentLineItemsViewTable from "@/components/document-table/DocumentLineItemsViewTable";
import StatusBadge from "@/components/StatusBadge";
import SendEmailDialog from "@/components/SendEmailDialog";
import DocumentPaymentActionBar from "@/components/invoice/DocumentPaymentActionBar";
import InvoicePaymentHistory from "@/components/invoice/InvoicePaymentHistory";
import { fetchDocumentPaymentHistory, fetchDocumentTimeline, fetchOzowReturnStatus } from "@/api/documentPaymentApi";
import { DocumentTimeline } from "@/components/documents/DocumentTimeline";
import { createPageUrl, createViewDocumentUrl } from "@/utils";
import CommercialSourceLink from "@/components/documents/CommercialSourceLink";
import {
  canConvertQuote,
  convertQuoteToInvoice,
  findInvoiceBySourceQuoteId,
  findQuoteByIdForInvoice,
  invoiceUrlFromConversion,
  isQuoteImmutable,
} from "@/services/QuoteConversionService";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { withTimeoutRetry, ENTITY_GET_TIMEOUT_MS } from "@/utils/fetchWithTimeout";
import { startLoadingFailSafe } from "@/hooks/useLoadingFailSafe";
import { downloadDocumentPreviewFromElement, waitForPreviewPaint } from "@/utils/documentPreviewPdf";
import { parseRouteDocumentTypeStrict, DOCUMENT_TYPES, allowedNextStatuses } from "@/document-engine";
import {
  normalizeInvoiceStatus,
  normalizeQuoteStatus,
  invoiceStatusLabel,
  quoteStatusLabel,
  QUOTE_STATUS,
} from "@shared/commercial/documentStatuses.js";

export default function ViewDocument() {
  const { docType: docTypeParam, id } = useParams();
  const docType = parseRouteDocumentTypeStrict(docTypeParam);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [record, setRecord] = useState(null);
  const [client, setClient] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bankingDetail, setBankingDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);
  const previewPdfRef = useRef(null);

  const loadDocument = useCallback(async () => {
    if (!id || !docType || (docType !== "invoice" && docType !== "quote")) {
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

      let related = {};
      if (docType === "invoice" && withItems.source_quote_id) {
        const sourceQuote = await findQuoteByIdForInvoice(withItems.source_quote_id);
        if (sourceQuote) {
          related.source_quote = sourceQuote;
          related.source_quote_number = sourceQuote.quote_number;
        }
      }
      if (docType === "quote") {
        const convertedInvoice = await findInvoiceBySourceQuoteId(withItems.id);
        if (convertedInvoice) {
          related.converted_invoice = convertedInvoice;
        }
      }

      setRecord({ ...withItems, ...related });
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
    const clearFailSafe = startLoadingFailSafe(setLoading);
    loadDocument().finally(clearFailSafe);
    return () => clearFailSafe();
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
      if (docType === "quote") {
        const { recordQuoteLifecycleEvent } = await import("@/services/documentEventClient");
        const eventType =
          status === "accepted" ? "accepted" : status === "declined" || status === "rejected" ? "rejected" : status === "expired" ? "expired" : null;
        if (eventType) {
          await recordQuoteLifecycleEvent({
            orgId: record.org_id,
            quoteId: record.id,
            clientId: record.client_id,
            eventType,
            metadata: { source: "owner_status" },
          });
        }
      }
      if (docType === "quote" && status === "accepted") {
        toast({
          title: "Quote accepted",
          description: "Convert it to an invoice when you are ready.",
          variant: "success",
          duration: 8000,
          action: (
            <ToastAction
              altText="Convert to invoice"
              className="border-white/40 bg-white/20 text-white hover:bg-white/30"
              onClick={async () => {
                try {
                  const result = await convertQuoteToInvoice(record);
                  const url = invoiceUrlFromConversion(result);
                  if (url) navigate(url);
                } catch (error) {
                  toast({
                    title: "Could not convert quote",
                    description: error?.message || "Please try again.",
                    variant: "destructive",
                  });
                }
              }}
            >
              Convert
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Status updated", description: status, variant: "success" });
      }
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

  useEffect(() => {
    if ((docType !== "invoice" && docType !== "quote") || !id) {
      setActivityEvents([]);
      return undefined;
    }
    let cancelled = false;
    fetchDocumentTimeline({ documentId: id, sourceKind: docType })
      .then((payload) => {
        if (!cancelled) setActivityEvents(payload.events || []);
      })
      .catch(() => {
        if (!cancelled) setActivityEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [docType, id]);

  useEffect(() => {
    if (docType !== "invoice" || !id) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await fetchDocumentPaymentHistory({ invoiceId: id });
        if (!cancelled) setPaymentHistory(snap.history || []);
      } catch {
        if (!cancelled) setPaymentHistory([]);
      }
    };
    void load();
    const intentId = searchParams.get("intent");
    if (searchParams.get("pay") === "return" && intentId) {
      void fetchOzowReturnStatus({ intentId }).then((status) => {
        if (cancelled) return;
        if (status.snapshot?.history) setPaymentHistory(status.snapshot.history);
        if (status.snapshot?.invoice_status && status.snapshot.invoice_status !== record?.status) {
          setRecord((prev) => (prev ? { ...prev, status: status.snapshot.invoice_status } : prev));
        }
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [docType, id, searchParams, record?.status]);

  const listHref = docType === "quote" ? createPageUrl("Quotes") : createPageUrl("Invoices");
  const currentStatus = useMemo(() => {
    if (docType === "quote") return normalizeQuoteStatus(record?.status);
    return normalizeInvoiceStatus(record?.status);
  }, [docType, record?.status]);
  const statusOptions = useMemo(() => {
    if (!docType) return [];
    const next = allowedNextStatuses(docType, currentStatus).filter((status) => {
      if (docType === "quote" && status === QUOTE_STATUS.converted) return false;
      return true;
    });
    return [currentStatus, ...next.filter((status) => status !== currentStatus)];
  }, [docType, currentStatus]);

  if (docType === DOCUMENT_TYPES.payslip && id) {
    return <Navigate to={`${createPageUrl("ViewPayslip")}?id=${encodeURIComponent(id)}`} replace />;
  }

  if (!docType) {
    return (
      <div className="text-center py-16 px-4">
        <h2 className="text-xl font-semibold mb-2">Invalid document type</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Use <code className="text-xs bg-muted px-1 rounded">/ViewDocument/invoice/…</code>,{" "}
          <code className="text-xs bg-muted px-1 rounded">/ViewDocument/quote/…</code>, or{" "}
          <code className="text-xs bg-muted px-1 rounded">/ViewDocument/payslip/…</code> (redirects to payslip viewer).
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
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto pb-28 md:pb-6">
      {docType === "invoice" && (
        <DocumentPaymentActionBar
          invoice={record}
          client={client}
          onEdit={() => navigate(`${createPageUrl("EditInvoice")}?id=${encodeURIComponent(record.id)}`)}
          onSend={() => setEmailOpen(true)}
          onDownloadReceipt={downloadPDF}
          onRefresh={loadDocument}
        />
      )}
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
              <StatusBadge
                status={record.status}
                variant={docType === "quote" ? "quote" : "invoice"}
                invoice={docType === "invoice" ? record : null}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{displayName}</p>
            <CommercialSourceLink quote={docType === "quote" ? record : null} invoice={docType === "invoice" ? record : null} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {docType === "quote" && record?.id && (
            <>
              {record.converted_invoice?.id ? (
                <Button
                  className="gap-2 bg-primary"
                  onClick={() => navigate(createViewDocumentUrl("invoice", record.converted_invoice.id))}
                >
                  <ArrowRightSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">View invoice</span>
                  <span className="sm:hidden">Invoice</span>
                </Button>
              ) : canConvertQuote(record) ? (
                <Button
                  className="gap-2 bg-primary"
                  onClick={async () => {
                    try {
                      const result = await convertQuoteToInvoice(record);
                      const url = invoiceUrlFromConversion(result);
                      toast({
                        title: result.already_converted ? "Quote already converted" : "Invoice created",
                        description: result.invoice_number || "Opening the invoice.",
                        variant: "success",
                      });
                      if (url) navigate(url);
                    } catch (error) {
                      toast({
                        title: "Could not convert quote",
                        description: error?.message || "Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <ArrowRightSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Convert to invoice</span>
                  <span className="sm:hidden">To invoice</span>
                </Button>
              ) : null}
              {!isQuoteImmutable(record) && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate(`${createPageUrl("EditQuote")}?id=${encodeURIComponent(record.id)}`)}
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
            </>
          )}
          <Select
            value={currentStatus}
            onValueChange={updateStatus}
            disabled={docType === "quote" && isQuoteImmutable(record)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {docType === "quote" ? quoteStatusLabel(s) : invoiceStatusLabel(s)}
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

      <div className="rounded-xl border border-border/50 bg-card p-4 sm:p-5">
        <DocumentLineItemsViewTable
          items={record.items}
          currencyCode={record.currency || previewDoc.currency || profile?.currency}
          taxRate={record.tax_rate ?? previewDoc.tax_rate}
          discount={record.discount_value ?? record.discount_amount ?? previewDoc.discount}
          discountType={record.discount_type}
          vatMode={record.vat_mode}
          storedTotals={{
            subtotal: Number(record.subtotal) || 0,
            discountAmt: Number(record.discount_amount) || 0,
            taxAmount: Number(record.tax_amount) || 0,
            total: Number(record.total_amount) || 0,
          }}
        />
      </div>

      {docType === "invoice" && (
        <InvoicePaymentHistory
          history={paymentHistory}
          currency={record.currency || previewDoc.currency || profile?.currency}
        />
      )}

      <div className="rounded-xl border border-border/50 bg-card p-4 sm:p-5">
        <DocumentTimeline events={activityEvents} />
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
