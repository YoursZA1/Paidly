import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  Download,
  FilePenLine,
  Loader2,
  PackageCheck,
  Pencil,
  Printer,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/components/CurrencySelector";
import generatePdfFromElement from "@/utils/generatePdfFromElement";
import { escapeHtml } from "@/utils/htmlSecurity";
import { createPageUrl } from "@/utils";
import {
  PO_FINANCIAL_STATUS_LABEL,
  PO_PAYMENT_METHODS,
  PO_STATUS_LABEL,
  purchaseOrderFinancialStatus,
  canApprovePurchaseOrder,
  canCancelPurchaseOrder,
  canEditPurchaseOrder,
  canPayPurchaseOrder,
  canReceivePurchaseOrder,
  canReturnToDraft,
  canRevisePurchaseOrder,
  canSendPurchaseOrder,
  canSubmitPurchaseOrder,
} from "@shared/procurement/purchaseOrderMath.js";
import { listPurchaseOrderEvents, listPurchaseOrderPayments } from "@/services/PurchaseOrderService";
import PurchaseOrderDocument from "./PurchaseOrderDocument";
import SendPurchaseOrderDialog from "./SendPurchaseOrderDialog";
import { PO_FINANCIAL_STATUS_TEXT, PO_STATUS_BADGE } from "./purchaseOrderBadges";
import { buildPurchaseOrderDocumentModel, buildPurchaseOrderEventHistory, formatPoDate } from "./purchaseOrderDocumentModel";

const DOC_WIDTH = 794;
const methodLabel = (value) => PO_PAYMENT_METHODS.find((m) => m.value === value)?.label || value || "—";

/** Scales the fixed-width A4 document down to the available width (phones), never up. */
function FitToWidth({ children }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(undefined);

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const next = Math.min(1, outer.current.clientWidth / DOC_WIDTH);
      setScale(next);
      setHeight(inner.current.offsetHeight * next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    // overflow-hidden: scale() does not shrink the layout box, so the unscaled 794px would overflow.
    <div ref={outer} className="w-full overflow-hidden" style={{ height }}>
      <div
        ref={inner}
        className="mx-auto overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10"
        style={{ width: DOC_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, strong = false, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone || ""}`}>{value}</dd>
    </div>
  );
}

/**
 * PO document preview: Download PDF · Print · Send to Supplier, the next workflow step for its status
 * (edit/submit, approve/return, receive, pay, revise, cancel), where it stands financially
 * (Committed → Payable → Paid, due date), its supplier payments and its history.
 */
export default function PurchaseOrderPreviewDialog({
  open,
  onOpenChange,
  purchaseOrder,
  items = [],
  supplier,
  business,
  productsById,
  revisionOf = null,
  revisedAs = null,
  onOpenPurchaseOrder,
  onEdit,
  onSubmit,
  onReturnToDraft,
  onApprove,
  onRevise,
  onReceive,
  onPay,
  onCancel,
  onSent,
}) {
  const { toast } = useToast();
  const docRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [events, setEvents] = useState([]);
  const [sendOpen, setSendOpen] = useState(false);

  const model = useMemo(
    () => buildPurchaseOrderDocumentModel({ purchaseOrder, items, supplier, business, productsById }),
    [purchaseOrder, items, supplier, business, productsById]
  );
  const history = useMemo(
    () => buildPurchaseOrderEventHistory(events, purchaseOrder, payments),
    [events, purchaseOrder, payments]
  );
  const f = model.financials;
  const money = (v) => formatCurrency(v, model.currency);
  const filename = `${model.number || "purchase-order"}.pdf`;

  const poId = purchaseOrder?.id;
  const amountPaid = purchaseOrder?.amount_paid;
  // Any change to the order (status, receipts, sends, edits) bumps updated_at: refresh the history then.
  const updatedAt = purchaseOrder?.updated_at;
  useEffect(() => {
    if (!open || !poId) return;
    let cancelled = false;
    Promise.allSettled([listPurchaseOrderPayments(poId), listPurchaseOrderEvents(poId)]).then(([paid, trail]) => {
      if (cancelled) return;
      if (paid.status === "rejected") console.warn("Could not load purchase order payments", paid.reason);
      if (trail.status === "rejected") console.warn("Could not load purchase order history", trail.reason);
      setPayments(paid.status === "fulfilled" ? paid.value : []);
      setEvents(trail.status === "fulfilled" ? trail.value : []);
    });
    return () => { cancelled = true; };
  }, [open, poId, amountPaid, updatedAt]);

  const handleDownload = useCallback(async () => {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      await generatePdfFromElement(docRef.current, filename);
    } catch (e) {
      toast({ variant: "destructive", title: "Download failed", description: e?.message || String(e) });
    } finally {
      setDownloading(false);
    }
  }, [filename, toast]);

  const handlePrint = useCallback(() => {
    if (!docRef.current) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast({ variant: "destructive", title: "Print blocked", description: "Allow pop-ups for this site to print." });
      return;
    }
    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(filename)}</title>` +
        `<style>body{margin:0;padding:0;}@page{size:A4;margin:10mm;}@media print{body{margin:0;}` +
          // Repeat the item header on every page; never split a line, the totals or the signature block.
          `thead{display:table-header-group;}tr{break-inside:avoid;page-break-inside:avoid;}}</style>` +
        `</head><body>${docRef.current.outerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
  }, [filename, toast]);

  if (!purchaseOrder) return null;
  const canSend = canSendPurchaseOrder(purchaseOrder);
  const financialStatus = purchaseOrderFinancialStatus(purchaseOrder);
  const po = purchaseOrder;
  const due = model.dueDate;
  const dueTone = f.isOverdue ? "text-red-600 dark:text-red-400" : f.daysUntilDue != null && f.daysUntilDue <= 7 ? "text-amber-700 dark:text-amber-400" : "";
  const dueHint = f.owed <= 0 || f.daysUntilDue == null
    ? ""
    : f.isOverdue
      ? `${Math.abs(f.daysUntilDue)} days overdue`
      : f.daysUntilDue === 0
        ? "Due today"
        : `In ${f.daysUntilDue} days`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[95vh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-4 sm:px-5 py-3 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base">
                  {model.number}
                  <Badge variant="outline" className={`font-normal ${PO_STATUS_BADGE[model.status] || ""}`}>
                    {PO_STATUS_LABEL[model.status]}
                  </Badge>
                  {financialStatus !== "not_committed" && financialStatus !== "cancelled" && (
                    <span className={`text-xs font-medium ${PO_FINANCIAL_STATUS_TEXT[financialStatus] || "text-muted-foreground"}`}>
                      {PO_FINANCIAL_STATUS_LABEL[financialStatus]}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 truncate">
                  {model.supplier?.name || "No supplier"} · Total order value {money(model.totals.total)}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload} disabled={downloading}>
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download PDF
                </Button>
                <Button
                  variant={canApprovePurchaseOrder(purchaseOrder) ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setSendOpen(true)}
                  disabled={!canSend}
                  title={canSend ? undefined : "Approve the purchase order before sending it"}
                >
                  <Send className="h-3.5 w-3.5" /> Send to Supplier
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px] bg-muted/40">
              <div className="min-w-0">
                <FitToWidth>
                  <PurchaseOrderDocument ref={docRef} model={model} accent={business?.brandPrimary || undefined} />
                </FitToWidth>
              </div>

              <aside className="space-y-4">
                {(revisionOf || revisedAs) && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    {revisionOf && (
                      <p>
                        Revision of{" "}
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenPurchaseOrder?.(revisionOf.id)}>
                          {revisionOf.po_number}
                        </button>
                      </p>
                    )}
                    {revisedAs && (
                      <p>
                        Replaced by{" "}
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenPurchaseOrder?.(revisedAs.id)}>
                          {revisedAs.po_number}
                        </button>
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {canEditPurchaseOrder(po) && (
                    <Button variant="outline" className="gap-2" onClick={() => onEdit(po)}>
                      <Pencil className="h-4 w-4" /> Edit draft
                    </Button>
                  )}
                  {canSubmitPurchaseOrder(po) && (
                    <Button className="gap-2" onClick={() => onSubmit(po)}>
                      <Send className="h-4 w-4" /> Submit for approval
                    </Button>
                  )}
                  {canApprovePurchaseOrder(po) && (
                    <Button className="gap-2" onClick={() => onApprove(po)}>
                      <CheckCircle2 className="h-4 w-4" /> Approve · commit {money(model.totals.total)}
                    </Button>
                  )}
                  {canReturnToDraft(po) && (
                    <Button variant="outline" className="gap-2" onClick={() => onReturnToDraft(po)}>
                      <Undo2 className="h-4 w-4" /> Return to draft
                    </Button>
                  )}
                  {canReceivePurchaseOrder(po) && (
                    <Button variant="outline" className="gap-2" onClick={() => onReceive(po)}>
                      <PackageCheck className="h-4 w-4" /> Receive goods
                    </Button>
                  )}
                  {canPayPurchaseOrder(po) && (
                    <Button variant="outline" className="gap-2" onClick={() => onPay(po)}>
                      <Banknote className="h-4 w-4" /> Record supplier payment
                    </Button>
                  )}
                  {canRevisePurchaseOrder(po) && (
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => onRevise(po)}>
                      <FilePenLine className="h-4 w-4" /> Revise order
                    </Button>
                  )}
                  {onCancel && canCancelPurchaseOrder(po) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => onCancel(po)}
                    >
                      <XCircle className="h-4 w-4" /> Cancel order
                    </Button>
                  )}
                </div>

                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Financial position</h3>
                  {f.committed <= 0 && model.status !== "cancelled" ? (
                    <div className="space-y-2">
                      <dl className="space-y-1.5">
                        <Row label="PO total" value={money(model.totals.total)} strong />
                        {due && <Row label="Payment due" value={due} />}
                      </dl>
                      <p className="text-sm text-muted-foreground">
                        {model.status === "pending_approval" ? "Pending approval" : "Draft"} — not committed until approved.
                      </p>
                    </div>
                  ) : (
                    <>
                      <dl className="space-y-1.5">
                        <Row label="PO total" value={money(f.total)} strong />
                        <Row label="Amount received" value={money(f.received)} />
                        <Row label="Amount paid" value={money(f.paid)} tone="text-emerald-700 dark:text-emerald-400" />
                        <div className="border-t border-border pt-1.5 mt-1.5">
                          <Row label="Outstanding" value={money(f.owed)} strong tone={f.owed > 0 ? "text-amber-700 dark:text-amber-400" : ""} />
                        </div>
                        {due && (
                          <>
                            <Row label="Payment due" value={due} tone={dueTone} />
                            {dueHint && <p className={`-mt-1 text-right text-xs ${dueTone || "text-muted-foreground"}`}>{dueHint}</p>}
                          </>
                        )}
                        {f.released > 0 && <Row label="Released by cancelling" value={money(f.released)} tone="text-muted-foreground" />}
                      </dl>
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                        {[
                          ["Committed", f.committedOpen, ""],
                          ["Payable", f.payableNow, "text-amber-700 dark:text-amber-400"],
                          ["Paid", f.paid, "text-emerald-700 dark:text-emerald-400"],
                        ].map(([label, value, tone]) => (
                          <div key={label} className="rounded-md bg-muted/50 px-1.5 py-2">
                            <div className="text-[11px] text-muted-foreground">{label}</div>
                            <div className={`text-xs font-semibold tabular-nums ${tone}`}>{money(value)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Committed and payable amounts are not expenses. Only recorded payments reach Cash Flow actuals; open
                    balances are planned on their due date.
                  </p>
                </section>

                {f.committed > 0 || model.status === "cancelled" ? (
                  <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3">Receiving</h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium pb-1">Item</th>
                          <th className="text-right font-medium pb-1">Ordered</th>
                          <th className="text-right font-medium pb-1">Received</th>
                          <th className="text-right font-medium pb-1">Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.lines.map((l) => {
                          const remaining = Math.max(0, Math.round((l.quantity - l.quantityReceived) * 100) / 100);
                          return (
                            <tr key={l.id} className="border-t border-border/60 align-top">
                              <td className="py-1 pr-2 break-words">{l.name}</td>
                              <td className="py-1 text-right tabular-nums">{l.quantity}</td>
                              <td className="py-1 text-right tabular-nums">{l.quantityReceived}</td>
                              <td className={`py-1 text-right tabular-nums ${remaining > 0 ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                                {remaining}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                ) : null}

                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Supplier payments</h3>
                    {payments.length > 0 && (
                      <Link to={createPageUrl("CashFlow")} className="text-xs font-medium text-primary hover:underline">
                        View in Cash Flow
                      </Link>
                    )}
                  </div>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {payments.map((p) => (
                        <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div>{formatPoDate(p.date, "dd MMM yyyy")} · {methodLabel(p.payment_method)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[p.payment_reference && `Ref ${p.payment_reference}`, p.expense_number].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div className="tabular-nums font-medium">{money(p.amount)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">History</h3>
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {history.map((event) => (
                      <li key={event.key} className="text-sm">
                        <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/70" aria-hidden="true" />
                        <div>
                          {event.label}
                          {event.amount ? <span className="tabular-nums"> · {money(event.amount)}</span> : null}
                        </div>
                        {event.detail ? <div className="text-xs text-muted-foreground break-words">{event.detail}</div> : null}
                        <div className="text-xs text-muted-foreground">{formatPoDate(event.at, event.dateOnly ? "dd MMM yyyy" : "dd MMM yyyy, HH:mm")}</div>
                      </li>
                    ))}
                  </ol>
                </section>
              </aside>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SendPurchaseOrderDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        purchaseOrder={purchaseOrder}
        items={items}
        supplier={supplier}
        business={business}
        productsById={productsById}
        onDownload={handleDownload}
        getPdfElement={() => docRef.current}
        onReceive={canReceivePurchaseOrder(purchaseOrder) ? () => { setSendOpen(false); onReceive(purchaseOrder); } : null}
        onSent={onSent}
      />
    </>
  );
}
