import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import { createPageUrl } from "@/utils";
import {
  PO_EXPENSE_CATEGORIES,
  PO_PAYMENT_METHODS,
  purchaseOrderFinancials,
} from "@shared/procurement/purchaseOrderMath.js";

const newOperationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null;

/**
 * Supplier payment against a PO. Saved as an expense (source: the PO) on the date paid, so it is the
 * moment the money reaches Cash Flow. Ends in a Done state with what is still owed.
 */
export default function RecordSupplierPaymentDialog({ open, onOpenChange, purchaseOrder, supplier, onRecord, onPreview }) {
  const f = useMemo(() => purchaseOrderFinancials(purchaseOrder || {}), [purchaseOrder]);
  const currency = purchaseOrder?.currency || "ZAR";
  const money = (v) => formatCurrency(v, currency);

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState("eft");
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("inventory");
  const [notes, setNotes] = useState("");
  const [operationId, setOperationId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!open || !purchaseOrder) return;
    // Default to what is due for goods already received; before delivery, the full amount owed (deposit).
    const suggested = f.payableNow > 0 ? f.payableNow : f.owed;
    setAmount(suggested > 0 ? suggested.toFixed(2) : "");
    setPaidOn(format(new Date(), "yyyy-MM-dd"));
    setMethod("eft");
    setReference("");
    setCategory(purchaseOrder.expense_category || "inventory");
    setNotes("");
    setOperationId(newOperationId());
    setError("");
    setDone(null);
    // Reset only when the dialog opens for a PO, not when the PO refreshes after saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrder?.id]);

  const value = Number(amount);
  const tooMuch = Number.isFinite(value) && value > f.owed + 0.001;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await onRecord(purchaseOrder, {
        amount: value,
        paid_on: paidOn,
        payment_method: method,
        reference,
        category,
        notes,
        client_operation_id: operationId,
      });
      setDone(res);
    } catch (err) {
      setError(err?.message || "The payment could not be recorded. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!purchaseOrder) return null;

  const after = done ? purchaseOrderFinancials(done.purchaseOrder) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        {done ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Supplier payment recorded</DialogTitle>
              <DialogDescription>{purchaseOrder.po_number}</DialogDescription>
            </DialogHeader>
            <DoneState
              variant="dialog"
              title="Supplier payment recorded"
              reference={{
                number: `${purchaseOrder.po_number} → ${done.expense?.expense_number || "Expense"}`,
                counterparty: supplier?.name,
                amount: money(done.expense?.amount),
                meta: `Paid ${format(new Date(`${done.expense?.date || paidOn}T00:00:00`), "dd MMMM yyyy")} · booked to expenses`,
              }}
              status={{
                label: "Supplier balance",
                value: after.owed > 0 ? `${money(after.owed)} still owed` : "Paid in full",
                tone: after.owed > 0 ? "pending" : "success",
              }}
              pending={
                after.awaitingDelivery > 0
                  ? `${money(after.awaitingDelivery)} of goods still to be delivered.`
                  : null
              }
              actions={[
                { label: "View in Cash Flow", icon: ArrowRight, to: createPageUrl("CashFlow") },
                { label: "View purchase order", icon: Eye, variant: "outline", onClick: () => onPreview?.(done.purchaseOrder) },
                { label: "Done", variant: "ghost", onClick: () => onOpenChange(false) },
              ]}
            />
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Record supplier payment</DialogTitle>
              <DialogDescription>
                {purchaseOrder.po_number}{supplier?.name ? ` · ${supplier.name}` : ""}. Saved as an expense on the date paid.
              </DialogDescription>
            </DialogHeader>

            <dl className="my-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Order value</dt>
                <dd className="text-sm font-semibold tabular-nums">{money(f.committed)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Received</dt>
                <dd className="text-sm font-semibold tabular-nums">{money(f.received)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Owed</dt>
                <dd className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">{money(f.owed)}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="po-pay-amount">Amount paid</Label>
                <Input
                  id="po-pay-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={f.owed || undefined}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={tooMuch || undefined}
                />
                {f.payableNow < f.owed && f.payableNow > 0 && (
                  <p className="text-xs text-muted-foreground">{money(f.payableNow)} is for goods already received.</p>
                )}
                {f.received <= 0 && (
                  <p className="text-xs text-muted-foreground">Nothing received yet — this is a deposit.</p>
                )}
                {tooMuch && <p className="text-xs text-destructive">More than the {money(f.owed)} owed.</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-pay-date">Date paid</Label>
                <Input
                  id="po-pay-date"
                  type="date"
                  required
                  max={format(new Date(), "yyyy-MM-dd")}
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PO_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-pay-ref">Reference</Label>
                <Input id="po-pay-ref" placeholder="e.g. EFT ref or receipt no." value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>Expense category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PO_EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="po-pay-notes">Notes</Label>
                <Textarea id="po-pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}

            <DialogFooter className="mt-5 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !(value > 0) || tooMuch} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Recording…" : `Record ${value > 0 ? money(value) : "payment"}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
