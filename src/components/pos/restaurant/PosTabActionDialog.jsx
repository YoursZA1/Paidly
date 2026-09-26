import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/utils/currencyCalculations";
import { tabLabel } from "@shared/pos/restaurant.js";

const COPY = {
  transfer: { title: "Transfer table", description: "Move this order to a free table. Kitchen tickets follow it.", cta: "Move order" },
  merge: { title: "Merge tables", description: "Bring another table's order into this one. Its items and kitchen tickets move here.", cta: "Merge" },
  discount: { title: "Apply discount", description: "Taken off the bill before any service charge.", cta: "Apply" },
  service_charge: { title: "Service charge", description: "Added to the bill as a percentage of the (discounted) subtotal.", cta: "Save" },
  details: { title: "Guests, customer & note", description: "Shown on kitchen tickets and the bill.", cta: "Save" },
  void: { title: "Void order", description: "Cancels this order and its kitchen tickets. Paid orders cannot be voided.", cta: "Void order" },
};

/**
 * One dialog for the table actions that need input. `kind` picks the form; onSubmit receives the
 * body for POST /api/pos/tab (without action/tab_id).
 */
export default function PosTabActionDialog({ kind, onOpenChange, bundle, floorState, currency, onSubmit }) {
  const tab = bundle?.tab;
  const [value, setValue] = useState("");
  const [guests, setGuests] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!kind || !tab) return;
    setError("");
    setTarget(null);
    setValue(kind === "discount" ? String(tab.discount_amount || "") : kind === "service_charge" ? String(tab.service_charge_rate || "10") : "");
    setGuests(tab.guests ? String(tab.guests) : "");
    setCustomer(tab.customer_name || "");
    setNote(tab.note || "");
  }, [kind, tab]);

  if (!kind || !tab) return null;
  const copy = COPY[kind];
  const tables = (floorState?.tables || []).filter((t) => t.id !== tab.table_id);
  const choices = kind === "transfer" ? tables.filter((t) => !t.tab) : kind === "merge" ? tables.filter((t) => t.tab) : [];

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      let body = {};
      if (kind === "transfer") body = { to_table_id: target };
      else if (kind === "merge") body = { from_tab_id: target };
      else if (kind === "discount") body = { amount: Number(value) || 0 };
      else if (kind === "service_charge") body = { rate: Number(value) || 0 };
      else if (kind === "details") body = { guests: guests ? Number(guests) : null, customer_name: customer, note };
      else if (kind === "void") body = { reason: note };
      await onSubmit(kind, body);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Could not update the order");
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    busy || ((kind === "transfer" || kind === "merge") && !target) || ((kind === "discount" || kind === "service_charge") && value === "");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {copy.title} · {tab.label}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {kind === "transfer" || kind === "merge" ? (
          choices.length ? (
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
              {choices.map((t) => {
                const id = kind === "merge" ? t.tab.id : t.id;
                return (
                  <Button key={t.id} type="button" variant={target === id ? "default" : "outline"} className="h-auto min-h-14 flex-col" onClick={() => setTarget(id)}>
                    <span className="font-semibold">{tabLabel(null, t)}</span>
                    <span className="text-[11px] opacity-80">
                      {kind === "merge" ? formatCurrency(t.tab.totals.total, currency) : `${t.seats} seats`}
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{kind === "transfer" ? "There are no free tables." : "No other table has an open order."}</p>
          )
        ) : null}

        {kind === "discount" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pos-tab-discount">Discount amount (subtotal {formatCurrency(tab.totals.subtotal, currency)})</Label>
            <Input id="pos-tab-discount" inputMode="decimal" className="h-12 text-lg" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        ) : null}

        {kind === "service_charge" ? (
          <div className="space-y-2">
            <Label htmlFor="pos-tab-service">Service charge %</Label>
            <div className="flex gap-2">
              {["0", "10", "12.5", "15"].map((v) => (
                <Button key={v} type="button" variant={value === v ? "default" : "outline"} className="h-11" onClick={() => setValue(v)}>
                  {v}%
                </Button>
              ))}
              <Input id="pos-tab-service" inputMode="decimal" className="h-11 w-24" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          </div>
        ) : null}

        {kind === "details" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pos-tab-guests">Guests</Label>
              <Input id="pos-tab-guests" inputMode="numeric" className="h-11" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-tab-customer">Customer name</Label>
              <Input id="pos-tab-customer" className="h-11" value={customer} maxLength={120} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-tab-note">Note for the kitchen / bill</Label>
              <Textarea id="pos-tab-note" rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        ) : null}

        {kind === "void" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pos-tab-void">Reason</Label>
            <Input id="pos-tab-void" className="h-11" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Guests left before ordering" />
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" variant={kind === "void" ? "destructive" : "default"} className="h-12 w-full" disabled={disabled} onClick={() => void submit()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {copy.cta}
          </Button>
          <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
