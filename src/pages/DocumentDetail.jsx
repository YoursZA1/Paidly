import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import { DocumentEditor, DocumentTimeline } from "@/components/documents";
import { DocumentService } from "@/services/DocumentService";
import { DOCUMENT_TYPES } from "@/document-engine/documentTypes";
import { QUOTE_STATUSES, INVOICE_STATUSES, PAYSLIP_STATUSES } from "@/document-engine/documentStateMachine";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import { documentStatusBadgeVariant, documentTypeBadgeVariant } from "@/document-engine/documentUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/utils/currencyCalculations";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [title, setTitle] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState([]);
  const viewLoggedForId = useRef(null);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const row = await DocumentService.get(documentId);
      setDoc(row);
      if (row) {
        setTitle(row.title ?? "");
        setTaxRate(String(row.tax_rate ?? 0));
        setDiscount(String(row.discount_amount ?? 0));
        setLines((row.document_items || []).map(lineFromRow));
        if (row.type === DOCUMENT_TYPES.invoice) {
          const summary = await DocumentService.getPaymentSummary(row.id, row.total_amount);
          setPaymentSummary(summary);
        } else {
          setPaymentSummary(null);
        }
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
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!documentId || loading || !doc?.id || doc.id !== documentId) return;
    if (viewLoggedForId.current === documentId) return;
    viewLoggedForId.current = documentId;
    DocumentService.recordView(documentId, { surface: "app_document_detail" }).catch(() => {});
  }, [documentId, loading, doc?.id]);

  const previewTotals = useMemo(() => {
    return aggregateFromItems(toPersistItems(lines), Number(taxRate) || 0, Number(discount) || 0);
  }, [lines, taxRate, discount]);

  const handleSave = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      const updated = await DocumentService.update(documentId, {
        title: title.trim() || null,
        tax_rate: Number(taxRate) || 0,
        discount_amount: Number(discount) || 0,
        items: toPersistItems(lines),
      });
      setDoc(updated);
      setLines((updated.document_items || []).map(lineFromRow));
      if (updated.type === DOCUMENT_TYPES.invoice) {
        const summary = await DocumentService.getPaymentSummary(updated.id, updated.total_amount);
        setPaymentSummary(summary);
      }
      toast({
        title: "Saved",
        description: "Document and line items were updated.",
      });
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

  const handleSend = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      const updated = await DocumentService.send(documentId);
      setDoc(updated);
      if (updated.type === DOCUMENT_TYPES.invoice) {
        const summary = await DocumentService.getPaymentSummary(updated.id, updated.total_amount);
        setPaymentSummary(summary);
      }
      toast({
        title: "Sent",
        description: "Status is now Sent. Follow up from your usual channels if needed.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not mark as sent",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      const updated = await DocumentService.update(documentId, { status: QUOTE_STATUSES.accepted });
      setDoc(updated);
      toast({
        title: "Quote accepted",
        description: "You can convert this quote to a draft invoice when ready.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!documentId || !doc) return;
    setSaving(true);
    try {
      const paidStatus = doc.type === DOCUMENT_TYPES.payslip ? PAYSLIP_STATUSES.paid : INVOICE_STATUSES.paid;
      const updated = await DocumentService.update(documentId, { status: paidStatus });
      setDoc(updated);
      if (updated.type === DOCUMENT_TYPES.invoice) {
        const summary = await DocumentService.getPaymentSummary(updated.id, updated.total_amount);
        setPaymentSummary(summary);
      }
      toast({
        title: "Marked as paid",
        description: "Totals and status are updated on this document record.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      const { invoice } = await DocumentService.convertToInvoice(documentId);
      toast({
        title: "Invoice created",
        description: "Opening the new draft invoice.",
      });
      navigate(`${createPageUrl("Documents")}/${encodeURIComponent(invoice.id)}`);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: e?.message || String(e),
      });
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

  if (loading) {
    return <DocumentDetailSkeleton />;
  }

  if (!doc) {
    return (
      <PageTemplate>
        <Card className="mx-auto max-w-lg border-dashed">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle>Document not found</CardTitle>
            <CardDescription>It may have been removed, or you may not have access under your current organization.</CardDescription>
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

  const currency = doc.currency || "ZAR";
  const isDraft = doc.status === "draft";
  const isQuote = doc.type === DOCUMENT_TYPES.quote;
  const isInvoice = doc.type === DOCUMENT_TYPES.invoice;
  const isPayslip = doc.type === DOCUMENT_TYPES.payslip;
  const canSend = isDraft;
  const canAcceptQuote = isQuote && doc.status === QUOTE_STATUSES.sent;
  const canConvert = isQuote && doc.status === QUOTE_STATUSES.accepted;
  const canMarkPaid =
    (isInvoice && (doc.status === INVOICE_STATUSES.sent || doc.status === INVOICE_STATUSES.overdue)) ||
    (isPayslip && doc.status === PAYSLIP_STATUSES.sent);

  const headerTitle =
    doc.document_number != null && String(doc.document_number).trim()
      ? `${doc.title?.trim() || "Untitled"} · ${doc.document_number}`
      : doc.title?.trim() || "Untitled document";

  const summary = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant={documentTypeBadgeVariant(doc.type)} className="capitalize">
          {doc.type}
        </Badge>
        <Badge variant={documentStatusBadgeVariant(doc.status)} className="capitalize">
          {doc.status}
        </Badge>
      </div>
      {isInvoice && doc.source_quote_id ? (
        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <Link to={`${createPageUrl("Documents")}/${encodeURIComponent(doc.source_quote_id)}`}>View original quote</Link>
        </Button>
      ) : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Figures below reflect your current edits. Use <span className="font-medium text-foreground">Save</span> to write
        them to the database.
      </p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(previewTotals.subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(previewTotals.tax_amount, currency)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="tabular-nums text-foreground">{formatCurrency(Number(discount) || 0, currency)}</dd>
        </div>
        <Separator />
        <div className="flex justify-between gap-2 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatCurrency(previewTotals.total_amount, currency)}</dd>
        </div>
      </dl>
      {isInvoice && paymentSummary ? (
        <>
          <Separator />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular-nums text-foreground">{formatCurrency(paymentSummary.paid, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Balance</dt>
              <dd className="tabular-nums text-foreground">{formatCurrency(paymentSummary.balance, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Payment state</dt>
              <dd className="capitalize">{paymentSummary.status}</dd>
            </div>
          </dl>
        </>
      ) : null}
      <DocumentTimeline events={doc.document_events || []} />
    </div>
  );

  const form = (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-1 -ml-2 gap-1 text-muted-foreground hover:text-foreground" asChild>
          <Link to={createPageUrl("Documents")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All documents
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Basics, tax, and discount. Currency is {currency}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Website redesign" autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-tax">Tax rate (%)</Label>
              <Input id="doc-tax" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-discount">Discount amount</Label>
              <Input
                id="doc-discount"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Line items</CardTitle>
            <CardDescription>Quantity × unit price; line total defaults from those values.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No line items yet. Add at least one line, then save.
            </p>
          ) : (
            lines.map((line) => (
              <div
                key={line._key}
                className="grid gap-2 rounded-lg border border-border bg-background/50 p-3 sm:grid-cols-[minmax(0,1fr)_88px_112px_auto]"
              >
                <Input
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => updateLine(line._key, { description: e.target.value })}
                  aria-label="Line description"
                />
                <Input
                  inputMode="decimal"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(line._key, { quantity: e.target.value })}
                  aria-label="Quantity"
                />
                <Input
                  inputMode="decimal"
                  placeholder="Unit price"
                  value={line.unit_price}
                  onChange={(e) => updateLine(line._key, { unit_price: e.target.value })}
                  aria-label="Unit price"
                />
                <Button type="button" variant="ghost" size="sm" className="justify-self-end text-destructive hover:text-destructive" onClick={() => removeLine(line._key)}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Save
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
        {canConvert ? (
          <Button type="button" onClick={handleConvert} disabled={saving}>
            Convert to invoice
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <PageTemplate>
      <DocumentEditor
        title={headerTitle}
        description="Edit on the left; the summary shows live totals and a full audit trail."
        summaryTitle="Totals & activity"
        form={form}
        summary={summary}
      />
    </PageTemplate>
  );
}
