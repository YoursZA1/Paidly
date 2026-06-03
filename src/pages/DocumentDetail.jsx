import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import { DocumentTimeline } from "@/components/documents";
import DocumentDetailSidebar from "@/components/documents/DocumentDetailSidebar";
import DocumentAttachmentsPanel from "@/components/documents/DocumentAttachmentsPanel";
import DocumentCommentsPanel from "@/components/documents/DocumentCommentsPanel";
import DocumentHistoryPanel from "@/components/documents/DocumentHistoryPanel";
import { DocumentService } from "@/services/DocumentService";
import { Client } from "@/api/entities";
import { DOCUMENT_TYPES } from "@/document-engine/documentTypes";
import { QUOTE_STATUSES, INVOICE_STATUSES, PAYSLIP_STATUSES } from "@/document-engine/documentStateMachine";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import { isFinancialType, getConversionOptions, typeLabel } from "@/document-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/utils/currencyCalculations";
import { COMMON_CURRENCIES } from "@/data/currencies";
import { ArrowLeft, FileText, Loader2, LayoutTemplate } from "lucide-react";

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
    total_price: L.total_price != null && L.total_price !== "" ? Number(L.total_price) : undefined,
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
  const [doc, setDoc] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [documentCurrency, setDocumentCurrency] = useState("ZAR");
  const [lines, setLines] = useState([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDefault, setTemplateDefault] = useState(false);
  const viewLoggedForId = useRef(null);

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
        setTemplateName(row.title ? `${row.title} template` : `${typeLabel(row.type)} template`);
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Client.list("-created_date", { limit: 200 })
      .then((rows) => setClients(Array.isArray(rows) ? rows : []))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (!documentId || loading || !doc?.id || doc.id !== documentId) return;
    if (viewLoggedForId.current === documentId) return;
    viewLoggedForId.current = documentId;
    DocumentService.recordView(documentId, { surface: "app_document_detail" }).catch(() => {});
  }, [documentId, loading, doc?.id]);

  const previewTotals = useMemo(() => {
    if (!doc || !isFinancialType(doc.type)) return null;
    return aggregateFromItems(toPersistItems(lines), Number(taxRate) || 0, Number(discount) || 0);
  }, [doc, lines, taxRate, discount]);

  const conversionOptions = useMemo(
    () => (doc ? getConversionOptions(doc.type) : []),
    [doc?.type]
  );

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
      const updated = await DocumentService.update(documentId, patch);
      await load();
      toast({ title: "Saved", description: "Document was updated." });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e?.message || String(e) });
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
      toast({ variant: "destructive", title: "Could not update client", description: e?.message });
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
      toast({ variant: "destructive", title: "Could not mark as sent", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      await DocumentService.update(documentId, { status: QUOTE_STATUSES.accepted });
      await load();
      toast({ title: "Quote accepted" });
    } catch (e) {
      toast({ variant: "destructive", title: "Update failed", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      const paidStatus = doc.type === DOCUMENT_TYPES.payslip ? PAYSLIP_STATUSES.paid : INVOICE_STATUSES.paid;
      await DocumentService.update(documentId, { status: paidStatus });
      await load();
      toast({ title: "Marked as paid" });
    } catch (e) {
      toast({ variant: "destructive", title: "Update failed", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (targetType) => {
    if (!documentId) return;
    setSaving(true);
    try {
      const result = await DocumentService.convertDocument(documentId, targetType);
      const target = result?.target || result?.invoice;
      toast({ title: "Conversion complete", description: `Opening ${typeLabel(target?.type || targetType)}.` });
      if (target?.id) navigate(`${createPageUrl("Documents")}/${encodeURIComponent(target.id)}`);
      else await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Conversion failed", description: e?.message });
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
      toast({ variant: "destructive", title: "Could not save template", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, total_price: null, line_order: prev.length },
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
              <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle>Document not found</CardTitle>
            <CardDescription>It may have been removed, or you may not have access.</CardDescription>
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
    (isInvoice && (doc.status === INVOICE_STATUSES.sent || doc.status === INVOICE_STATUSES.overdue)) ||
    (isPayslip && doc.status === PAYSLIP_STATUSES.sent);

  const headerTitle =
    doc.document_number?.trim()
      ? `${doc.title?.trim() || "Untitled"} · ${doc.document_number}`
      : doc.title?.trim() || "Untitled document";

  return (
    <PageTemplate>
      <div className="mb-6 space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground hover:text-foreground" asChild>
          <Link to={createPageUrl("Documents")}>
            <ArrowLeft className="h-4 w-4" />
            All documents
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{headerTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground capitalize">
              {typeLabel(doc.type)} · {doc.archived_at ? "Archived" : doc.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setTemplateOpen(true)}>
              <LayoutTemplate className="h-4 w-4" /> Save as template
            </Button>
            {canSend ? (
              <Button type="button" variant="secondary" onClick={handleSend} disabled={saving}>
                Mark sent
              </Button>
            ) : null}
            {canAcceptQuote ? (
              <Button type="button" variant="secondary" onClick={handleAcceptQuote} disabled={saving}>
                Accept quote
              </Button>
            ) : null}
            {canMarkPaid ? (
              <Button type="button" variant="secondary" onClick={handleMarkPaid} disabled={saving}>
                Mark paid
              </Button>
            ) : null}
            {conversionOptions.map((opt) => {
              const disabled =
                saving ||
                (isQuote && opt.targetType === "invoice" && doc.status !== QUOTE_STATUSES.accepted);
              return (
                <Button key={opt.targetType} type="button" variant="secondary" disabled={disabled} onClick={() => handleConvert(opt.targetType)}>
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-start">
        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
                <CardDescription>Title and core content for this document.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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
                              <SelectItem key={item.code} value={item.code}>
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
                        <Input id="doc-tax" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="doc-discount">Discount</Label>
                        <Input id="doc-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
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
                  <Button type="button" size="sm" variant="outline" onClick={addLine}>
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
                          onChange={(e) => updateLine(line._key, { description: e.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => updateLine(line._key, { quantity: e.target.value })}
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Unit price"
                          value={line.unit_price}
                          onChange={(e) => updateLine(line._key, { unit_price: e.target.value })}
                        />
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeLine(line._key)}>
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
                      <dd className="tabular-nums">{formatCurrency(previewTotals.subtotal, currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tax</dt>
                      <dd className="tabular-nums">{formatCurrency(previewTotals.tax_amount, currency)}</dd>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular-nums">{formatCurrency(previewTotals.total_amount, currency)}</dd>
                    </div>
                  </dl>
                  {isInvoice && paymentSummary ? (
                    <>
                      <Separator className="my-3" />
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Paid</dt>
                          <dd>{formatCurrency(paymentSummary.paid, currency)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Balance</dt>
                          <dd>{formatCurrency(paymentSummary.balance, currency)}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                  {currency !== baseCurrency ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Rate: 1 {currency} = {exchangeRate.toFixed(6)} {baseCurrency}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="activity">
            <Card className="p-4">
              <DocumentTimeline events={doc.document_events || []} className="border-t-0 pt-0" />
            </Card>
          </TabsContent>

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
                  toast({ variant: "destructive", title: "Failed", description: e?.message });
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
                  toast({ variant: "destructive", title: "Failed", description: e?.message });
                } finally {
                  setSaving(false);
                }
              }}
            />
          </TabsContent>

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
                  toast({ variant: "destructive", title: "Failed", description: e?.message });
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

          <TabsContent value="history">
            <Card className="p-4">
              <DocumentHistoryPanel events={doc.document_events || []} />
            </Card>
          </TabsContent>
        </Tabs>

        <DocumentDetailSidebar doc={doc} clients={clients} onClientChange={handleClientChange} saving={saving} />
      </div>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Save this document&apos;s structure and content as a reusable template. Set it as the default for{" "}
              {typeLabel(doc.type)} to pre-fill new documents from the New Document menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input id="tpl-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={templateDefault} onCheckedChange={(v) => setTemplateDefault(Boolean(v))} />
              Set as default for {typeLabel(doc.type)}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
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
