import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CheckCircle2, Eye, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  DEFAULT_PO_PAYMENT_TERMS,
  DEFAULT_PO_VAT_RATE,
  PO_EXPENSE_CATEGORIES,
  PO_PAYMENT_TERMS,
  paymentTermsCodeFromText,
  purchaseOrderDueDate,
  purchaseOrderLineAmounts,
  purchaseOrderTotals,
} from "@shared/procurement/purchaseOrderMath.js";
import { formatPoDate } from "./purchaseOrderDocumentModel";

const CUSTOM = "__custom__";

const lineKey = () => `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function emptyLine() {
  return {
    key: lineKey(),
    product_id: "",
    description: "",
    quantity_ordered: 1,
    unit_cost: "",
    discount_percent: 0,
    vat_rate: DEFAULT_PO_VAT_RATE,
  };
}

const today = () => format(new Date(), "yyyy-MM-dd");
const isoDate = (v) => (v ? String(v).slice(0, 10) : "");

/**
 * Create or edit a draft purchase order. Shows Subtotal / Discount / VAT / Total Order Value and the
 * payment due date as fields change (same math as the database). Save keeps it a draft; Save & submit
 * sends it for approval. Creating or submitting ends in a Done state — a draft or pending order is not
 * committed spend until approved.
 */
export default function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  purchaseOrder = null,
  items = [],
  suppliers = [],
  products = [],
  currency = "ZAR",
  defaultDeliveryAddress = "",
  onSave,
  onApproveSaved,
  onPreviewSaved,
  isSaving,
}) {
  const editing = Boolean(purchaseOrder?.id);
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [termsCode, setTermsCode] = useState(DEFAULT_PO_PAYMENT_TERMS);
  const [termsTouched, setTermsTouched] = useState(false);
  const [customDueDate, setCustomDueDate] = useState("");
  const [category, setCategory] = useState("inventory");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [saved, setSaved] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const po = purchaseOrder;
    setSupplierId(po?.supplier_id || "");
    setOrderDate(isoDate(po?.order_date) || today());
    setExpectedDate(isoDate(po?.expected_date));
    setTermsCode(po?.payment_terms_code || DEFAULT_PO_PAYMENT_TERMS);
    setTermsTouched(Boolean(po?.payment_terms_code));
    setCustomDueDate(po?.payment_terms_code === "custom" ? isoDate(po?.due_date) : "");
    setCategory(po?.expense_category || "inventory");
    setDeliveryAddress(po ? po.delivery_address || "" : defaultDeliveryAddress || "");
    setDeliveryInstructions(po?.delivery_instructions || "");
    setNotes(po?.notes || "");
    setTerms(po?.terms || "");
    const existing = [...(items || [])]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((item) => ({
        key: lineKey(),
        product_id: item.product_id || "",
        description: item.description || "",
        quantity_ordered: Number(item.quantity_ordered),
        unit_cost: Number(item.unit_cost),
        discount_percent: Number(item.discount_percent || 0),
        vat_rate: Number(item.vat_rate || 0),
      }));
    setLines(existing.length ? existing : [emptyLine()]);
    setSaved(null);
    setError("");
    // Initialise once per open / target PO; items arrive with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrder?.id, defaultDeliveryAddress]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplier = suppliers.find((s) => s.id === supplierId) || null;

  const handleSupplier = (id) => {
    setSupplierId(id);
    const next = suppliers.find((s) => s.id === id);
    if (next && !termsTouched) setTermsCode(paymentTermsCodeFromText(next.payment_terms));
    if (next?.lead_time_days && !expectedDate) {
      setExpectedDate(format(addDays(new Date(`${orderDate || today()}T00:00:00`), Number(next.lead_time_days)), "yyyy-MM-dd"));
    }
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const pickProduct = (key, value) => {
    if (value === CUSTOM) {
      updateLine(key, { product_id: "" });
      return;
    }
    const product = productById.get(value);
    const line = lines.find((l) => l.key === key);
    const patch = { product_id: value };
    if (product && (!line?.description || productById.has(line.product_id))) patch.description = product.name;
    if (product && (line?.unit_cost === "" || Number(line?.unit_cost) === 0) && Number(product.cost_price) > 0) {
      patch.unit_cost = Number(product.cost_price);
    }
    updateLine(key, patch);
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key) => setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));

  const validLines = lines.filter(
    (l) => (l.product_id || String(l.description).trim()) && Number(l.quantity_ordered) > 0 && Number(l.unit_cost || 0) >= 0
  );
  const totals = purchaseOrderTotals(validLines);
  const money = (v) => formatCurrency(v, currency);
  const dueDate = purchaseOrderDueDate({ code: termsCode, orderDate, expectedDate, customDueDate });
  const dueBeforeOrder = Boolean(dueDate && orderDate && dueDate < orderDate);

  const submit = async (submitForApproval) => {
    setError("");
    if (validLines.length === 0) return;
    if (submitForApproval && !supplierId) {
      setError("Choose a supplier before submitting for approval.");
      return;
    }
    if (termsCode === "custom" && !customDueDate) {
      setError("Pick the payment due date for custom terms.");
      return;
    }
    const po = await onSave(
      {
        id: purchaseOrder?.id || null,
        supplier_id: supplierId || null,
        order_date: orderDate || null,
        expected_date: expectedDate || null,
        currency,
        payment_terms_code: termsCode,
        due_date: termsCode === "custom" ? customDueDate : null,
        expense_category: category,
        delivery_address: deliveryAddress,
        delivery_instructions: deliveryInstructions,
        notes,
        terms,
        items: validLines.map((l) => ({
          product_id: l.product_id || null,
          description: String(l.description || "").trim() || null,
          quantity_ordered: Number(l.quantity_ordered),
          unit_cost: Number(l.unit_cost) || 0,
          discount_percent: Number(l.discount_percent) || 0,
          vat_rate: Number(l.vat_rate) || 0,
        })),
      },
      { submit: submitForApproval }
    );
    if (!po) return;
    // Editing a draft is a routine save: the page confirms with a toast.
    if (editing && po.status === "draft") {
      onOpenChange(false);
      return;
    }
    setSaved({ ...po, supplierName: supplier?.name || "" });
  };

  const approveSaved = async () => {
    setIsApproving(true);
    try {
      const approved = await onApproveSaved(saved);
      if (approved) setSaved((prev) => ({ ...prev, ...approved }));
    } finally {
      setIsApproving(false);
    }
  };

  const busy = isSaving || isApproving;

  const done = (() => {
    if (!saved) return null;
    const due = formatPoDate(saved.due_date);
    if (saved.status === "approved") {
      return {
        tone: "success",
        title: "Purchase order approved",
        status: { label: "Status", value: "Approved — committed spend", tone: "success" },
        pending: `${money(saved.total_amount)} is committed${due ? `, payment due ${due}` : ""}. It becomes an expense only when you record the supplier payment.`,
        actions: [
          { label: "Preview & send to supplier", icon: Send, onClick: () => onPreviewSaved(saved) },
          { label: "Done", variant: "ghost", onClick: () => onOpenChange(false) },
        ],
      };
    }
    if (saved.status === "pending_approval") {
      return {
        tone: "pending",
        title: "Submitted for approval",
        status: { label: "Status", value: "Pending approval — not yet committed", tone: "pending" },
        pending: "Nothing is committed until it is approved. Lines and terms are locked; return it to draft to change them.",
        actions: [
          { label: isApproving ? "Approving…" : "Approve now", icon: CheckCircle2, onClick: approveSaved, disabled: isApproving },
          { label: "Preview", icon: Eye, variant: "outline", onClick: () => onPreviewSaved(saved) },
          { label: "Done", variant: "ghost", onClick: () => onOpenChange(false) },
        ],
      };
    }
    return {
      tone: "pending",
      title: "Draft saved",
      status: { label: "Status", value: "Draft — editable, not committed", tone: "neutral" },
      pending: "Drafts don't count as committed spend. Submit it for approval when it's ready.",
      actions: [
        { label: "Preview", icon: Eye, variant: "outline", onClick: () => onPreviewSaved(saved) },
        { label: "Done", variant: "ghost", onClick: () => onOpenChange(false) },
      ],
    };
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className={`${saved ? "sm:max-w-[560px]" : "sm:max-w-[920px]"} max-h-[92vh] overflow-y-auto`}>
        {saved ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{done.title}</DialogTitle>
              <DialogDescription>{saved.po_number}</DialogDescription>
            </DialogHeader>
            <DoneState
              variant="dialog"
              tone={done.tone}
              title={done.title}
              reference={{
                number: saved.po_number,
                counterparty: saved.supplierName || undefined,
                amount: `Total order value ${money(saved.total_amount)}`,
                meta: saved.due_date ? `${saved.payment_terms || "Payment"} · due ${formatPoDate(saved.due_date)}` : undefined,
              }}
              status={done.status}
              pending={done.pending}
              actions={done.actions}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${purchaseOrder.po_number}` : "New Purchase Order"}</DialogTitle>
              <DialogDescription>
                Drafts stay editable. Submitting locks the order for approval; approving commits the spend. It becomes an
                expense only when you pay the supplier.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(false);
              }}
              className="space-y-5 py-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Supplier</Label>
                  {/* Always a string: undefined would make Radix Select uncontrolled and keep showing the last pick. */}
                  <Select value={supplierId || ""} onValueChange={handleSupplier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-order-date">Order date</Label>
                  <Input id="po-order-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-expected-date">Expected delivery</Label>
                  <Input id="po-expected-date" type="date" value={expectedDate} min={orderDate || undefined} onChange={(e) => setExpectedDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Payment terms</Label>
                  <Select
                    value={termsCode}
                    onValueChange={(value) => {
                      setTermsCode(value);
                      setTermsTouched(true);
                    }}
                  >
                    <SelectTrigger aria-label="Payment terms">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PO_PAYMENT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  {termsCode === "custom" ? (
                    <>
                      <Label htmlFor="po-due-date">Due date</Label>
                      <Input
                        id="po-due-date"
                        type="date"
                        min={orderDate || undefined}
                        value={customDueDate}
                        onChange={(e) => setCustomDueDate(e.target.value)}
                        required
                      />
                    </>
                  ) : (
                    <>
                      <Label>Payment due</Label>
                      <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-sm">
                        {dueDate ? formatPoDate(dueDate) : "—"}
                      </div>
                    </>
                  )}
                  {termsCode === "due_on_receipt" && (
                    <p className="text-xs text-muted-foreground">Moves to the actual date goods arrive.</p>
                  )}
                  {dueBeforeOrder && <p className="text-xs text-destructive">The due date is before the order date.</p>}
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Expense category when paid</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PO_EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="w-4 h-4 mr-1" /> Add line
                  </Button>
                </div>
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_84px_108px_76px_76px_108px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <span>Product / description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit price</span>
                  <span className="text-right">Disc %</span>
                  <span className="text-right">VAT %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                <div className="space-y-3">
                  {lines.map((line) => {
                    const product = productById.get(line.product_id);
                    const amounts = purchaseOrderLineAmounts(line);
                    return (
                      <div
                        key={line.key}
                        className="rounded-lg border border-border p-3 md:border-0 md:p-0 grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_84px_108px_76px_76px_108px_32px] gap-2 items-start"
                      >
                        <div className="col-span-2 md:col-span-1 grid gap-2">
                          <Select value={line.product_id || (line.description ? CUSTOM : "")} onValueChange={(val) => pickProduct(line.key, val)}>
                            <SelectTrigger aria-label="Product">
                              <SelectValue placeholder="Select product or custom item" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CUSTOM}>Custom item (no stock)</SelectItem>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder={line.product_id ? "Description (optional)" : "Description"}
                            aria-label="Description"
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          />
                          {product?.stock_quantity != null && (
                            <div className="text-xs text-muted-foreground">In stock: {product.stock_quantity}</div>
                          )}
                        </div>
                        <label className="grid gap-1 text-xs text-muted-foreground md:block">
                          <span className="md:sr-only">Qty</span>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="text-right"
                            value={line.quantity_ordered}
                            onChange={(e) => updateLine(line.key, { quantity_ordered: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground md:block">
                          <span className="md:sr-only">Unit price (excl. VAT)</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="text-right"
                            value={line.unit_cost}
                            onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground md:block">
                          <span className="md:sr-only">Discount %</span>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="text-right"
                            value={line.discount_percent}
                            onChange={(e) => updateLine(line.key, { discount_percent: e.target.value })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground md:block">
                          <span className="md:sr-only">VAT %</span>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            className="text-right"
                            value={line.vat_rate}
                            onChange={(e) => updateLine(line.key, { vat_rate: e.target.value })}
                          />
                        </label>
                        <div className="flex items-center justify-between md:justify-end md:h-10 text-sm font-medium tabular-nums">
                          <span className="md:hidden text-xs text-muted-foreground font-normal">Line total</span>
                          {money(amounts.total)}
                        </div>
                        <div className="flex justify-end md:h-10 md:items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => removeLine(line.key)}
                            disabled={lines.length === 1}
                            aria-label="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Unit prices exclude VAT. Discount applies before VAT.</p>
              </div>

              <div className="flex justify-end">
                <dl className="w-full sm:w-80 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{money(totals.subtotal)}</dd></div>
                  {totals.discountTotal > 0 && (
                    <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{money(totals.discountTotal)}</dd></div>
                  )}
                  <div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="tabular-nums">{money(totals.vatTotal)}</dd></div>
                  <div className="flex justify-between items-baseline border-t border-border pt-2 mt-2">
                    <dt className="font-semibold">Total Order Value</dt>
                    <dd className="text-lg font-semibold tabular-nums">{money(totals.total)}</dd>
                  </div>
                  {dueDate && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <dt>Payment due</dt>
                      <dd>{formatPoDate(dueDate)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="po-delivery-address">Delivery address</Label>
                  <Textarea id="po-delivery-address" rows={3} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-delivery-instructions">Delivery instructions</Label>
                  <Textarea
                    id="po-delivery-instructions"
                    rows={3}
                    placeholder="e.g. Receiving hours 08:00–16:00, ask for stores"
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-notes">Notes to supplier</Label>
                  <Textarea id="po-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-terms">Terms & conditions</Label>
                  <Textarea
                    id="po-terms"
                    rows={3}
                    placeholder="e.g. Please quote the PO number on your invoice."
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

              <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" variant="outline" disabled={isSaving || validLines.length === 0 || dueBeforeOrder}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save draft
                </Button>
                <Button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={isSaving || validLines.length === 0 || dueBeforeOrder}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Save & submit · {money(totals.total)}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
