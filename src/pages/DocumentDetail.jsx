import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import { DocumentTimeline } from "@/components/documents";
import DocumentDetailSidebar from "@/components/documents/DocumentDetailSidebar";
import DocumentAttachmentsPanel from "@/components/documents/DocumentAttachmentsPanel";
import DocumentCommentsPanel from "@/components/documents/DocumentCommentsPanel";
import DocumentHistoryPanel from "@/components/documents/DocumentHistoryPanel";
import DocumentPdfPreviewModal from "@/components/documents/DocumentPdfPreviewModal";
import DocumentSendModal from "@/components/documents/DocumentSendModal";
import DocumentSignatureModal from "@/components/documents/DocumentSignatureModal";
import DocumentPdfTemplate from "@/components/documents/DocumentPdfTemplate";
import { DocumentService } from "@/services/DocumentService";
import { sendDocumentEmail } from "@/services/DocumentEmailService";
import { useAuth } from "@/contexts/AuthContext";
import { Client } from "@/api/entities";
import { DOCUMENT_TYPES } from "@/document-engine/documentTypes";
import {
  QUOTE_STATUSES,
  INVOICE_STATUSES,
  PAYSLIP_STATUSES,
} from "@/document-engine/documentStateMachine";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import { isFinancialType, getConversionOptions, typeLabel } from "@/document-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/utils/currencyCalculations";
import { COMMON_CURRENCIES } from "@/data/currencies";
import generatePdfFromElement from "@/utils/generatePdfFromElement";
import {
  ArrowLeft,
  FileText,
  Loader2,
  LayoutTemplate,
  Archive,
  ArchiveRestore,
  Eye,
  Download,
  Send,
  PenLine,
  Copy,
  MoreHorizontal,
} from "lucide-react";

function lineFromRow(row) {
  return {
    _key: row.id || crypto.randomUUID(),
    description: row.description ?? "",
    quantity: row.quantity ?? 1,
    unit_price: row.unit_price ?? 0,
    total_price: row.total_price ?? null,
    line_order: row.line_order ?? 0,
  };
}

function toPersistItems(lines) {
  return lines.map((L, i) => ({
    description: L.description,
    quantity: Number(L.quantity) || 0,
    unit_price: Number(L.unit_price) || 0,
    total_price:
      L.total_price != null && L.total_price !== ""
        ? Number(L.total_price)
        : undefined,
    line_order: i,
  }));
}

function DocumentDetailSkeleton() {
  return (
    <PageTemplate>
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 max-w-xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    </PageTemplate>
  );
}

export default function DocumentDetailPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  // ── Core document state ──
  const [doc, setDoc] = useState(null);
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [hubCaps, setHubCaps] = useState({
    templates: true,
    archive: true,
    assignees: true,
    newTypes: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState(null);

  // ── Edit fields ──
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [documentCurrency, setDocumentCurrency] = useState("ZAR");
  const [lines, setLines] = useState([]);

  // ── Template modal ──
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDefault, setTemplateDefault] = useState(false);

  // ── PDF workflow modals ──
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // ── Delivery + signature data ──
  const [sends, setSends] = useState([]);
  const [signatures, setSignatures] = useState([]);

  // Hidden PDF capture element (for direct download without opening modal)
  const hiddenPdfRef = useRef(null);

  const viewLoggedForId = useRef(null);

  // ── Derived client record (for PDF rendering) ──
  const activeClient = useMemo(
    () =>
      doc?.client_id
        ? clients.find((c) => c.id === doc.client_id) ?? null
        : null,
    [doc?.client_id, clients]
  );

  // ── Load ──
  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const row = await DocumentService.getDetail(documentId);
      setDoc(row);
      if (row) {
        setTitle(row.title ?? "");
        setBody(row.body ?? "");
        setTaxRate(String(row.tax_rate ?? 0));
        setDiscount(String(row.discount_amount ?? 0));
        setDocumentCurrency(row.currency || "ZAR");
        setLines((row.document_items || []).map(lineFromRow));
        setPaymentSummary(row.payment_summary || null);
        setTemplateName(
          row.title
            ? `${row.title} template`
            : `${typeLabel(row.type)} template`
        );
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load document",
        description: e?.message || String(e),
      });
      setDoc(null);
      setPaymentSummary(null);
    } finally {
      setLoading(false);
    }
  }, [documentId, toast]);

  const loadDelivery = useCallback(async () => {
    if (!documentId) return;
    const [sendsResult, sigsResult] = await Promise.allSettled([
      DocumentService.listSends(documentId),
      DocumentService.listSignatures(documentId),
    ]);
    if (sendsResult.status === "fulfilled")
      setSends(sendsResult.value);
    if (sigsResult.status === "fulfilled")
      setSignatures(sigsResult.value);
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDelivery();
  }, [loadDelivery]);

  useEffect(() => {
    Client.list("-created_date", { limit: 200 })
      .then((rows) => setClients(Array.isArray(rows) ? rows : []))
      .catch(() => setClients([]));
    DocumentService.listOrgMembers()
      .then((rows) => setMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setMembers([]));
    DocumentService.getHubCapabilities()
      .then(setHubCaps)
      .catch(() =>
        setHubCaps({
          templates: false,
          archive: false,
          assignees: false,
          newTypes: false,
        })
      );
  }, []);

  useEffect(() => {
    if (!documentId || loading || !doc?.id || doc.id !== documentId) return;
    if (viewLoggedForId.current === documentId) return;
    viewLoggedForId.current = documentId;
    DocumentService.recordView(documentId, {
      surface: "app_document_detail",
    }).catch(() => {});
  }, [documentId, loading, doc?.id]);

  // ── Computed ──
  const previewTotals = useMemo(() => {
    if (!doc || !isFinancialType(doc.type)) return null;
    return aggregateFromItems(
      toPersistItems(lines),
      Number(taxRate) || 0,
      Number(discount) || 0
    );
  }, [doc, lines, taxRate, discount]);

  const conversionOptions = useMemo(
    () => (doc ? getConversionOptions(doc.type) : []),
    [doc?.type]
  );

  // ── Handlers ──
  const handleSave = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      const patch = {
        title: title.trim() || null,
        body: body.trim() || null,
        client_id: doc.client_id,
      };
      if (isFinancialType(doc.type)) {
        patch.currency = documentCurrency;
        patch.tax_rate = Number(taxRate) || 0;
        patch.discount_amount = Number(discount) || 0;
        patch.items = toPersistItems(lines);
      }
      await DocumentService.update(documentId, patch);
      await load();
      toast({ title: "Saved", description: "Document was updated." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!hiddenPdfRef.current) return;
    setPdfDownloading(true);
    try {
      const filename =
        [doc?.document_number || typeLabel(doc?.type) || "document", ".pdf"]
          .join("")
          .replace(/\s+/g, "-");
      await generatePdfFromElement(hiddenPdfRef.current, filename);
      toast({ title: "PDF downloaded" });
      DocumentService.logPdfAction(documentId, "downloaded").catch(() => {});
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: e?.message || String(e),
      });
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleSendToClient = async (payload) => {
    setSaving(true);
    try {
      const isScheduled = Boolean(payload.scheduled_at);

      if (!isScheduled && payload.include_pdf !== false) {
        // Fire-and-forget email; errors are caught so DB record still lands.
        try {
          await sendDocumentEmail({
            pdfElement: hiddenPdfRef.current,
            doc: {
              ...doc,
              title,
              body,
              tax_rate: Number(taxRate) || 0,
              discount_amount: Number(discount) || 0,
              document_items: toPersistItems(lines).map((it, i) => ({
                ...it,
                id: `line-${i}`,
              })),
            },
            recipientEmail: payload.recipient_email,
            recipientName: payload.recipient_name,
            subject: payload.subject,
            message: payload.message,
            includePdf: true,
            workspace: authUser,
          });
        } catch (emailErr) {
          // Email sending can fail if edge function is unavailable; still record the send.
          console.warn("[DocumentDetail] email send failed:", emailErr?.message);
        }
      }

      await DocumentService.sendToClient(documentId, payload);
      await load();
      await loadDelivery();

      toast({
        title: isScheduled ? "Send scheduled" : "Sent",
        description: isScheduled
          ? `Scheduled for ${new Date(payload.scheduled_at).toLocaleString()}.`
          : `Document sent to ${payload.recipient_email}.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Send failed",
        description: e?.message || String(e),
      });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleRequestSignature = async (payload) => {
    setSaving(true);
    try {
      await DocumentService.requestSignature(documentId, payload);
      await load();
      await loadDelivery();
      toast({
        title: "Signature requested",
        description: `Sent to ${payload.signers.length} signer${payload.signers.length !== 1 ? "s" : ""}.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Request failed",
        description: e?.message || String(e),
      });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleClientChange = async (clientId) => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.update(documentId, { client_id: clientId });
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not update client",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAssigneeChange = async (assignedUserId) => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.update(documentId, {
        assigned_user_id: assignedUserId,
      });
      await load();
      toast({ title: "Assignee updated" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not assign",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      if (doc.archived_at) {
        await DocumentService.unarchive(documentId);
        toast({ title: "Document restored" });
      } else {
        await DocumentService.archive(documentId);
        toast({ title: "Document archived" });
      }
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.send(documentId);
      await load();
      toast({ title: "Sent", description: "Status is now Sent." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not mark as sent",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.update(documentId, {
        status: QUOTE_STATUSES.accepted,
      });
      await load();
      toast({ title: "Quote accepted" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      const paidStatus =
        doc.type === DOCUMENT_TYPES.payslip
          ? PAYSLIP_STATUSES.paid
          : INVOICE_STATUSES.paid;
      await DocumentService.update(documentId, { status: paidStatus });
      await load();
      toast({ title: "Marked as paid" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (targetType) => {
    if (!documentId) return;
    setSaving(true);
    try {
      const result = await DocumentService.convertDocument(
        documentId,
        targetType
      );
      const target = result?.target || result?.invoice;
      toast({
        title: "Conversion complete",
        description: `Opening ${typeLabel(target?.type || targetType)}.`,
      });
      if (target?.id)
        navigate(
          `${createPageUrl("Documents")}/${encodeURIComponent(target.id)}`
        );
      else await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      const copy = await DocumentService.duplicate(documentId);
      toast({ title: "Duplicated", description: "A draft copy was created." });
      if (copy?.id)
        navigate(
          `${createPageUrl("Documents")}/${encodeURIComponent(copy.id)}`
        );
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Duplicate failed",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.createTemplateFromDocument(documentId, {
        name: templateName.trim() || undefined,
        isDefault: templateDefault,
      });
      setTemplateOpen(false);
      toast({ title: "Template saved" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save template",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Line item helpers ──
  const updateLine = (key, patch) => {
    setLines((prev) =>
      prev.map((row) => (row._key === key ? { ...row, ...patch } : row))
    );
  };
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        description: "",
        quantity: 1,
        unit_price: 0,
        total_price: null,
        line_order: prev.length,
      },
    ]);
  };
  const removeLine = (key) => {
    setLines((prev) => prev.filter((row) => row._key !== key));
  };

  if (loading) return <DocumentDetailSkeleton />;

  if (!doc) {
    return (
      <PageTemplate>
        <Card className="mx-auto max-w-lg border-dashed">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText
                className="h-5 w-5 text-muted-foreground"
                aria-hidden
              />
            </div>
            <CardTitle>Document not found</CardTitle>
            <CardDescription>
              It may have been removed, or you may not have access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to={createPageUrl("Documents")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to documents
              </Link>
            </Button>
          </CardContent>
        </Card>
      </PageTemplate>
    );
  }

  const financial = isFinancialType(doc.type);
  const currency = doc.currency || "ZAR";
  const baseCurrency = doc.base_currency || "ZAR";
  const exchangeRate = Number(doc.exchange_rate || 1);
  const isDraft = doc.status === "draft";
  const isQuote = doc.type === DOCUMENT_TYPES.quote;
  const isInvoice = doc.type === DOCUMENT_TYPES.invoice;
  const isPayslip = doc.type === DOCUMENT_TYPES.payslip;
  const canSend = isDraft;
  const canAcceptQuote = isQuote && doc.status === QUOTE_STATUSES.sent;
  const canMarkPaid =
    (isInvoice &&
      (doc.status === INVOICE_STATUSES.sent ||
        doc.status === INVOICE_STATUSES.overdue)) ||
    (isPayslip && doc.status === PAYSLIP_STATUSES.sent);

  const headerTitle = doc.document_number?.trim()
    ? `${doc.title?.trim() || "Untitled"} · ${doc.document_number}`
    : doc.title?.trim() || "Untitled document";

  const pdfFilename = [
    doc.document_number || typeLabel(doc.type) || "document",
    ".pdf",
  ]
    .join("")
    .replace(/\s+/g, "-");

  // Default recipient pre-fill from client
  const defaultRecipientEmail =
    doc?.client?.email || activeClient?.email || "";
  const defaultRecipientName =
    doc?.client?.name || activeClient?.name || "";

  return (
    <PageTemplate>
      {/* ── Page header ── */}
      <div className="mb-6 space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link to={createPageUrl("Documents")}>
            <ArrowLeft className="h-4 w-4" />
            All documents
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {headerTitle}
            </h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {typeLabel(doc.type)} · {doc.archived_at ? "Archived" : doc.status}
            </p>
          </div>

          {/* ── Action bar ── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary: Save */}
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>

            {/* Primary: Preview PDF */}
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-4 w-4" />
              Preview PDF
            </Button>

            {/* Primary: Download PDF */}
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
            >
              {pdfDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PDF
            </Button>

            {/* Secondary actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={saving}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Document Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => setSendOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSignatureOpen(true)}>
                  <PenLine className="mr-2 h-4 w-4" />
                  Send for Signature
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                {hubCaps.templates && (
                  <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    Save as Template
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {hubCaps.archive && (
                  <DropdownMenuItem onClick={handleArchiveToggle}>
                    {doc.archived_at ? (
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                    ) : (
                      <Archive className="mr-2 h-4 w-4" />
                    )}
                    {doc.archived_at ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                )}

                {/* Status workflow */}
                {(canSend ||
                  canAcceptQuote ||
                  canMarkPaid ||
                  conversionOptions.length > 0) && (
                  <DropdownMenuSeparator />
                )}
                {canSend && (
                  <DropdownMenuItem onClick={handleSend}>
                    <Send className="mr-2 h-4 w-4" />
                    Mark as Sent
                  </DropdownMenuItem>
                )}
                {canAcceptQuote && (
                  <DropdownMenuItem onClick={handleAcceptQuote}>
                    Accept Quote
                  </DropdownMenuItem>
                )}
                {canMarkPaid && (
                  <DropdownMenuItem onClick={handleMarkPaid}>
                    Mark as Paid
                  </DropdownMenuItem>
                )}
                {conversionOptions.map((opt) => {
                  const disabled =
                    isQuote &&
                    opt.targetType === "invoice" &&
                    doc.status !== QUOTE_STATUSES.accepted;
                  return (
                    <DropdownMenuItem
                      key={opt.targetType}
                      onClick={() =>
                        !disabled && handleConvert(opt.targetType)
                      }
                      className={disabled ? "pointer-events-none opacity-50" : ""}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Main content grid ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-start">
        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
                <CardDescription>
                  Title and core content for this document.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input
                    id="doc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                {!financial ? (
                  <div className="space-y-2">
                    <Label htmlFor="doc-body">Content</Label>
                    <Textarea
                      id="doc-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="min-h-[200px]"
                      placeholder="Write the document body…"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={documentCurrency} disabled>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_CURRENCIES.map((item) => (
                              <SelectItem
                                key={item.code}
                                value={item.code}
                              >
                                {item.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Base currency</Label>
                        <Input value={baseCurrency} disabled />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="doc-tax">Tax rate (%)</Label>
                        <Input
                          id="doc-tax"
                          inputMode="decimal"
                          value={taxRate}
                          onChange={(e) => setTaxRate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="doc-discount">Discount</Label>
                        <Input
                          id="doc-discount"
                          inputMode="decimal"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {financial ? (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-base">Line items</CardTitle>
                    <CardDescription>Quantity × unit price.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addLine}
                  >
                    Add line
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lines.length === 0 ? (
                    <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      No line items yet.
                    </p>
                  ) : (
                    lines.map((line) => (
                      <div
                        key={line._key}
                        className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_88px_112px_auto]"
                      >
                        <Input
                          placeholder="Description"
                          value={line.description}
                          onChange={(e) =>
                            updateLine(line._key, {
                              description: e.target.value,
                            })
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line._key, { quantity: e.target.value })
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Unit price"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(line._key, {
                              unit_price: e.target.value,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeLine(line._key)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ) : null}

            {financial && previewTotals ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Totals preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd className="tabular-nums">
                        {formatCurrency(previewTotals.subtotal, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tax</dt>
                      <dd className="tabular-nums">
                        {formatCurrency(previewTotals.tax_amount, currency)}
                      </dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular-nums">
                        {formatCurrency(
                          previewTotals.total_amount,
                          currency
                        )}
                      </dd>
                    </div>
                  </dl>
                  {isInvoice && paymentSummary ? (
                    <>
                      <Separator className="my-3" />
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Paid</dt>
                          <dd>
                            {formatCurrency(paymentSummary.paid, currency)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Balance</dt>
                          <dd>
                            {formatCurrency(
                              paymentSummary.balance,
                              currency
                            )}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                  {currency !== baseCurrency ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Rate: 1 {currency} = {exchangeRate.toFixed(6)}{" "}
                      {baseCurrency}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* Activity */}
          <TabsContent value="activity">
            <Card className="p-4">
              <DocumentTimeline
                events={doc.document_events || []}
                className="border-t-0 pt-0"
              />
            </Card>
          </TabsContent>

          {/* Attachments */}
          <TabsContent value="attachments">
            <DocumentAttachmentsPanel
              attachments={doc.document_attachments || []}
              busy={saving}
              onAdd={async (payload) => {
                setSaving(true);
                try {
                  await DocumentService.addAttachment(documentId, payload);
                  await load();
                  toast({ title: "Attachment added" });
                } catch (e) {
                  toast({
                    variant: "destructive",
                    title: "Failed",
                    description: e?.message,
                  });
                } finally {
                  setSaving(false);
                }
              }}
              onRemove={async (id) => {
                setSaving(true);
                try {
                  await DocumentService.removeAttachment(id);
                  await load();
                } catch (e) {
                  toast({
                    variant: "destructive",
                    title: "Failed",
                    description: e?.message,
                  });
                } finally {
                  setSaving(false);
                }
              }}
            />
          </TabsContent>

          {/* Comments */}
          <TabsContent value="comments">
            <DocumentCommentsPanel
              comments={doc.document_comments || []}
              busy={saving}
              onAdd={async (text) => {
                setSaving(true);
                try {
                  await DocumentService.addComment(documentId, text);
                  await load();
                } catch (e) {
                  toast({
                    variant: "destructive",
                    title: "Failed",
                    description: e?.message,
                  });
                } finally {
                  setSaving(false);
                }
              }}
              onRemove={async (id) => {
                setSaving(true);
                try {
                  await DocumentService.removeComment(id);
                  await load();
                } finally {
                  setSaving(false);
                }
              }}
            />
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Card className="p-4">
              <DocumentHistoryPanel events={doc.document_events || []} />
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sidebar */}
        <DocumentDetailSidebar
          doc={doc}
          clients={clients}
          members={members}
          sends={sends}
          signatures={signatures}
          assigneesEnabled={hubCaps.assignees}
          onClientChange={handleClientChange}
          onAssigneeChange={handleAssigneeChange}
          saving={saving}
        />
      </div>

      {/* ── Hidden PDF capture element (for direct download) ── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <DocumentPdfTemplate
          ref={hiddenPdfRef}
          doc={{
            ...doc,
            title,
            body,
            tax_rate: Number(taxRate) || 0,
            discount_amount: Number(discount) || 0,
            document_items: toPersistItems(lines).map((it, i) => ({
              ...it,
              id: `line-${i}`,
            })),
          }}
          workspace={authUser}
          client={activeClient}
        />
      </div>

      {/* ── PDF preview modal ── */}
      <DocumentPdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        doc={{
          ...doc,
          title,
          body,
          tax_rate: Number(taxRate) || 0,
          discount_amount: Number(discount) || 0,
          document_items: toPersistItems(lines).map((it, i) => ({
            ...it,
            id: `line-${i}`,
          })),
        }}
        workspace={authUser}
        client={activeClient}
        onSendToClient={() => setSendOpen(true)}
        onSendForSignature={() => setSignatureOpen(true)}
      />

      {/* ── Send to client modal ── */}
      <DocumentSendModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        doc={doc}
        defaultRecipientEmail={defaultRecipientEmail}
        defaultRecipientName={defaultRecipientName}
        onSend={handleSendToClient}
      />

      {/* ── E-signature modal ── */}
      <DocumentSignatureModal
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        doc={doc}
        onRequestSignature={handleRequestSignature}
      />

      {/* ── Save as template dialog ── */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Save this document&apos;s structure and content as a reusable
              template. Set it as the default for {typeLabel(doc.type)} to
              pre-fill new documents from the New Document menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={templateDefault}
                onCheckedChange={(v) => setTemplateDefault(Boolean(v))}
              />
              Set as default for {typeLabel(doc.type)}
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTemplate>
  );
}
