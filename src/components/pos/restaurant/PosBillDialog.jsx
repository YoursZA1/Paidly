import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, Loader2, Printer, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/utils/currencyCalculations";
import { cn } from "@/lib/utils";
import { itemsShare, splitEqually } from "@shared/pos/restaurant.js";
import { payTab } from "@/services/PosRestaurantService";

const MODES = [
  { id: "full", label: "Full bill" },
  { id: "equal", label: "Split equally" },
  { id: "items", label: "By item" },
  { id: "amount", label: "By amount" },
];

const PAID_OR_PENDING = new Set(["paid", "pending", "requires_action", "processing"]);

function cashChips(due) {
  const chips = new Set([due]);
  for (const step of [10, 50, 100, 200]) chips.add(Math.ceil(due / step) * step);
  return [...chips].filter((v) => v >= due).sort((a, b) => a - b).slice(0, 4);
}

/**
 * Bill for one table: pay the whole balance or one portion of a split. Each payment is its own
 * payment intent and sale (cash on the till, or the connected provider). After each payment the
 * dialog shows the Done State with the remaining balance and "pay next guest".
 */
export default function PosBillDialog({ open, onOpenChange, bundle, currency, digitalProvider, initialMode = "full", onPaid, onRedirect, registerId, cashierName, brandName }) {
  const tab = bundle?.tab;
  const [mode, setMode] = useState(initialMode);
  const [parts, setParts] = useState(2);
  const [partIndex, setPartIndex] = useState(null);
  const [itemIds, setItemIds] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setParts(Math.max(2, Number(tab?.guests) || 2));
    setPartIndex(null);
    setItemIds([]);
    setAmount("");
    setMethod("cash");
    setTendered("");
    setError("");
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [open]);

  const balance = tab?.balance || { due: 0, available: 0, paid: 0 };
  const totals = tab?.totals || { total: 0 };
  const portions = useMemo(() => bundle?.portions || [], [bundle]);
  const carried = useMemo(() => {
    const ids = new Set();
    for (const p of portions) if (PAID_OR_PENDING.has(p.status)) for (const id of p.allocation?.carried_item_ids || []) ids.add(id);
    return ids;
  }, [portions]);
  const payableItems = (bundle?.items || []).filter((i) => i.status === "sent" && !carried.has(i.id));
  const equalParts = splitEqually(totals.total, parts);
  const paidParts = new Set(
    portions
      .filter((p) => p.split_kind === "equal" && p.allocation?.parts === parts && PAID_OR_PENDING.has(p.status))
      .map((p) => p.allocation.part_index)
  );

  const portionAmount = (() => {
    if (mode === "full") return balance.available;
    if (mode === "equal") return partIndex == null ? 0 : Math.min(equalParts[partIndex] || 0, balance.available);
    if (mode === "items")
      return Math.min(
        itemsShare({
          items: bundle?.items || [],
          selection: itemIds.map((id) => ({ id })),
          discountAmount: tab?.discount_amount,
          serviceChargeRate: tab?.service_charge_rate,
        }).amount,
        balance.available
      );
    return Math.min(Math.max(0, Number(amount) || 0), balance.available);
  })();
  const change = method === "cash" ? Math.max(0, (Number(tendered) || 0) - portionAmount) : 0;
  const cashShort = method === "cash" && (Number(tendered) || 0) < portionAmount;
  const digitalAvailable = digitalProvider !== null;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const split =
        mode === "equal"
          ? { kind: "equal", parts, part_index: partIndex }
          : mode === "items"
            ? { kind: "items", item_ids: itemIds, label: `Guest (${itemIds.length} item${itemIds.length === 1 ? "" : "s"})` }
            : mode === "amount"
              ? { kind: "amount", amount: Number(amount) }
              : { kind: "full" };
      const response = await payTab({
        tab_id: tab.id,
        payment_method: method,
        amount_tendered: method === "cash" ? Number(tendered) || portionAmount : undefined,
        split,
        register_id: registerId || undefined,
        cashier_name: cashierName || undefined,
        brand_name: brandName || undefined,
        idempotency_key: globalThis.crypto?.randomUUID?.(),
      });
      if (response.pending && response.next_action?.redirect_url) {
        onRedirect?.(response.next_action.redirect_url, { tabId: tab.id, intentId: response.payment_intent?.id });
        return;
      }
      setResult(response);
      onPaid?.(response);
      setPartIndex(null);
      setItemIds([]);
      setAmount("");
      setTendered("");
    } catch (err) {
      setError(err?.message || "Payment could not be taken");
    } finally {
      setBusy(false);
    }
  };

  if (!tab) return null;

  if (result) {
    const next = result.tab?.balance || balance;
    const settled = Boolean(next.settled);
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{settled ? "Bill paid" : "Payment taken"}</DialogTitle>
            <DialogDescription>{result.portion?.label}</DialogDescription>
          </DialogHeader>
          <DoneState
            variant="dialog"
            title={settled ? `${tab.label} paid in full` : `${result.portion?.label || "Payment"} paid`}
            reference={{
              number: `Order #${tab.order_number}`,
              counterparty: tab.label,
              amount: formatCurrency(result.portion?.amount || 0, currency),
              meta: result.change_due != null ? `Cash · change ${formatCurrency(result.change_due, currency)}` : "Paid",
            }}
            message={result.change_due > 0 ? `Give ${formatCurrency(result.change_due, currency)} change.` : null}
            actions={
              settled
                ? [
                    { label: "Close table", onClick: () => onOpenChange(false, { closeTab: true }) },
                    { label: "Print receipt", icon: Printer, onClick: () => onOpenChange(false, { receiptSale: result.sale }), variant: "outline" },
                  ]
                : [
                    { label: mode === "equal" ? "Pay next guest" : "Take next payment", icon: Users, onClick: () => setResult(null) },
                    { label: "Print receipt", icon: Printer, onClick: () => onOpenChange(false, { receiptSale: result.sale }), variant: "outline" },
                    { label: "Done", onClick: () => onOpenChange(false), variant: "ghost" },
                  ]
            }
            status={{ label: "Table balance", value: settled ? "Paid in full" : `${formatCurrency(next.due, currency)} still to pay`, tone: settled ? "success" : "pending" }}
            pending={settled ? "Close the table when the guests leave — it goes to Cleaning." : null}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Bill · {tab.label}</DialogTitle>
          <DialogDescription>
            {formatCurrency(balance.due, currency)} to pay
            {balance.paid > 0 ? ` · ${formatCurrency(balance.paid, currency)} already paid` : ""}
            {balance.pending > 0 ? ` · ${formatCurrency(balance.pending, currency)} being confirmed` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="How to pay">
          {MODES.map((m) => (
            <Button key={m.id} type="button" role="radio" aria-checked={mode === m.id} variant={mode === m.id ? "default" : "outline"} className="h-10 px-2 text-xs" onClick={() => setMode(m.id)}>
              {m.label}
            </Button>
          ))}
        </div>

        {mode === "equal" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="shrink-0">Guests</Label>
              {[2, 3, 4, 5, 6].map((n) => (
                <Button key={n} type="button" variant={parts === n ? "default" : "outline"} className="size-10" onClick={() => { setParts(n); setPartIndex(null); }}>
                  {n}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {equalParts.map((value, index) => {
                const paid = paidParts.has(index);
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={paid}
                    onClick={() => setPartIndex(index)}
                    className={cn(
                      "flex min-h-14 items-center justify-between rounded-lg border px-3 text-left text-sm touch-manipulation",
                      partIndex === index ? "border-primary bg-primary/10" : "border-border",
                      paid && "opacity-60"
                    )}
                  >
                    <span className="font-medium">Guest {index + 1}</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      {paid ? <Check className="size-4 text-emerald-600" aria-label="Paid" /> : null}
                      {formatCurrency(value, currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {mode === "items" ? (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {payableItems.length ? (
              payableItems.map((item) => {
                const checked = itemIds.includes(item.id);
                return (
                  <label key={item.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-2 hover:bg-muted">
                    <span className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked}
                        onChange={() => setItemIds((prev) => (checked ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
                      />
                      {item.quantity} × {item.name}
                    </span>
                    <span className="text-sm tabular-nums">{formatCurrency(item.line_total, currency)}</span>
                  </label>
                );
              })
            ) : (
              <p className="p-2 text-sm text-muted-foreground">Every item is already paid or being paid. Use Full bill or By amount for the rest.</p>
            )}
          </div>
        ) : null}

        {mode === "amount" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pos-bill-amount">Amount (max {formatCurrency(balance.available, currency)})</Label>
            <Input id="pos-bill-amount" inputMode="decimal" className="h-12 text-lg tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">This payment</p>
          <p className="font-display text-3xl font-bold tabular-nums">{formatCurrency(portionAmount, currency)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={method === "cash" ? "default" : "outline"} className="h-12" onClick={() => setMethod("cash")}>
            <Banknote className="size-4" /> Cash
          </Button>
          <Button
            type="button"
            variant={method === "digital" ? "default" : "outline"}
            className="h-12"
            disabled={!digitalAvailable}
            title={digitalAvailable ? undefined : "No digital payment provider is connected"}
            onClick={() => setMethod("digital")}
          >
            <Smartphone className="size-4" /> {digitalProvider?.label ? `EFT · ${digitalProvider.label}` : "EFT / Digital"}
          </Button>
        </div>

        {method === "cash" && portionAmount > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="pos-bill-tendered">Cash received</Label>
            <Input id="pos-bill-tendered" inputMode="decimal" className="h-12 text-lg tabular-nums" value={tendered} placeholder={portionAmount.toFixed(2)} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} />
            <div className="flex flex-wrap gap-2">
              {cashChips(portionAmount).map((v) => (
                <Button key={v} type="button" variant="outline" className="h-10" onClick={() => setTendered(String(v))}>
                  {formatCurrency(v, currency)}
                </Button>
              ))}
            </div>
            {Number(tendered) > 0 ? (
              <p className={cn("text-sm", cashShort ? "text-destructive" : "text-muted-foreground")}>
                {cashShort ? "Not enough cash for this payment." : `Change ${formatCurrency(change, currency)}`}
              </p>
            ) : null}
          </div>
        ) : null}
        {method === "digital" ? (
          <p className="text-xs text-muted-foreground">
            The customer pays on {digitalProvider?.label || "the payment provider"}. This portion is paid only when the provider confirms.
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <Button
          type="button"
          className="h-12 w-full text-sm font-semibold uppercase tracking-wide"
          disabled={busy || portionAmount <= 0 || (method === "cash" && Number(tendered) > 0 && cashShort)}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {method === "cash" ? `Take ${formatCurrency(portionAmount, currency)} cash` : `Request ${formatCurrency(portionAmount, currency)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
