import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChefHat,
  Combine,
  Loader2,
  Minus,
  MoreHorizontal,
  Percent,
  Plus,
  Printer,
  Receipt,
  Save,
  Scissors,
  Send,
  Sparkle,
  StickyNote,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/utils/currencyCalculations";
import { cn } from "@/lib/utils";
import { ORDER_TYPE, stationLabel } from "@shared/pos/restaurant.js";

const NEW_ORDER_TITLE = {
  [ORDER_TYPE.TAKEAWAY]: ["New takeaway order", "Add items, then send to the kitchen or take payment"],
  [ORDER_TYPE.COUNTER]: ["New counter order", "Add items, then send to the kitchen"],
};
import { clockTime, tableDotClass, tableStatusLabel } from "./posRestaurantUi";

const KITCHEN_LABEL = { new: "Sent", preparing: "Preparing", ready: "Ready", completed: "Served", void: "Void" };

function MoneyRow({ label, value, currency, strong = false, muted = false }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", strong ? "pt-1" : "text-sm", muted && "text-muted-foreground")}>
      <dt className={strong ? "text-xs font-semibold uppercase tracking-wider" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-display text-2xl font-bold tracking-tight")}>{formatCurrency(value, currency)}</dd>
    </div>
  );
}

/**
 * The cart, made contextual: "TABLE 12 · 4 guests · Mando · 18:42", previous rounds with kitchen
 * status, then NEW ITEMS (the till's cart) and the table's actions. Stateless — PosTerminal owns data.
 */
export default function PosTabPanel({
  bundle,
  orderType,
  newItems = [],
  currency,
  busy = "",
  canRefund = false,
  canDiscount = false,
  onQty,
  onNote,
  onSend,
  onSave,
  onPay,
  onSplit,
  onTransfer,
  onMerge,
  onDiscount,
  onServiceCharge,
  onRequestBill,
  onPrintBill,
  onDetails,
  onCloseTab,
  onCloseCleaning,
  onServe,
  onVoidTab,
  onVoidItem,
  onLeave,
  className = "",
}) {
  const tab = bundle?.tab || null;
  const items = useMemo(() => bundle?.items || [], [bundle]);
  const [noteFor, setNoteFor] = useState(null);
  const rounds = useMemo(() => {
    const map = new Map();
    for (const item of items.filter((i) => i.status !== "pending")) {
      const key = item.round || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);
  const saved = items.filter((i) => i.status === "pending");
  const newCount = newItems.reduce((sum, line) => sum + line.quantity, 0);
  const newTotal = newItems.reduce((sum, line) => sum + line.quantity * (Number(line.unit_price) || 0), 0);
  const totals = tab?.totals || { subtotal: 0, discount_amount: 0, service_charge: 0, total: 0 };
  const balance = tab?.balance || { paid: 0, due: totals.total, pending: 0, settled: false };
  const hasUnsent = newItems.length > 0 || saved.length > 0;
  // Takeaway and counter orders start from the menu; dine-in starts from a table or an order.
  const takeaway = orderType === ORDER_TYPE.TAKEAWAY || orderType === ORDER_TYPE.COUNTER;
  const dineIn = (tab?.order_type || orderType) === ORDER_TYPE.DINE_IN;
  const readyCount = Number(tab?.kitchen?.ready) || 0;
  const sentCount = items.filter((i) => i.status === "sent").length;
  const [newTitle, newSubtitle] = NEW_ORDER_TITLE[orderType] || ["Choose an order", "Select a table or order to begin."];
  const title = tab ? tab.label : newTitle;
  const subtitle = tab
    ? [
        tab.guests ? `${tab.guests} guest${tab.guests === 1 ? "" : "s"}` : null,
        tab.server_display || tab.server_name ? `Server: ${tab.server_display || tab.server_name}` : null,
        tab.opened_at ? clockTime(tab.opened_at) : null,
        tab.customer_name,
      ]
        .filter(Boolean)
        .join(" · ")
    : newSubtitle;

  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", className)} aria-label="Order">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            {tab?.table_status ? <span className={cn("size-2.5 shrink-0 rounded-full", tableDotClass(tab.table_status))} aria-hidden /> : null}
            <span className="truncate">{title}</span>
            {tab && balance.settled ? (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-900 dark:text-emerald-200">PAID</span>
            ) : null}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          {tab ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Order #{tab.order_number}
              {tab.table_status ? ` · ${tableStatusLabel(tab.table_status)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tab ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Table actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={onSplit} disabled={hasUnsent || balance.due <= 0}>
                  <Scissors className="mr-2 size-4" /> Split bill
                </DropdownMenuItem>
                {tab.order_type === ORDER_TYPE.DINE_IN ? (
                  <>
                    <DropdownMenuItem onSelect={onTransfer}>
                      <ArrowLeftRight className="mr-2 size-4" /> Transfer table
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onMerge} disabled={balance.paid > 0 || balance.pending > 0}>
                      <Combine className="mr-2 size-4" /> Merge tables
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem onSelect={onDetails}>
                  <StickyNote className="mr-2 size-4" /> Guests, customer & note
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDiscount} disabled={!canDiscount || balance.paid > 0 || balance.pending > 0}>
                  <Percent className="mr-2 size-4" /> Apply discount
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onServiceCharge} disabled={balance.paid > 0 || balance.pending > 0}>
                  <Plus className="mr-2 size-4" /> Service charge
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onRequestBill}>
                  <Receipt className="mr-2 size-4" /> {tab.bill_requested_at ? "Clear bill request" : "Bill requested"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onPrintBill}>
                  <Printer className="mr-2 size-4" /> Print bill
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onCloseTab} disabled={!balance.settled && totals.total > 0}>
                  <X className="mr-2 size-4" /> {dineIn ? "Close table" : "Complete order"}
                </DropdownMenuItem>
                {dineIn && onCloseCleaning ? (
                  <DropdownMenuItem onSelect={onCloseCleaning} disabled={!balance.settled && totals.total > 0}>
                    <Sparkle className="mr-2 size-4" /> Close · needs cleaning
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onVoidTab} disabled={balance.paid > 0 || balance.pending > 0} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 size-4" /> Void order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {onLeave ? (
            <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Back to floor" onClick={onLeave}>
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rounds.map(([round, lines]) => {
          const statuses = [...new Set(lines.map((l) => l.kitchen_status).filter(Boolean))];
          return (
            <div key={round} className="border-b border-border/60 px-4 py-3">
              <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Round {round || "—"}</span>
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  <ChefHat className="size-3" aria-hidden />
                  {statuses.map((s) => KITCHEN_LABEL[s] || s).join(" · ") || "Sent"}
                </span>
              </p>
              <ul className="space-y-1.5">
                {lines.map((item) => (
                  <li key={item.id} className={cn("flex items-start justify-between gap-2 text-sm", item.status === "void" && "text-muted-foreground line-through")}>
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="tabular-nums">{item.quantity} ×</span> {item.name}
                      </p>
                      {item.note ? <p className="truncate text-xs text-muted-foreground">– {item.note}</p> : null}
                      <p className="text-[11px] text-muted-foreground">{stationLabel(item.station)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="tabular-nums">{formatCurrency(item.line_total, currency)}</span>
                      {canRefund && item.status === "sent" && balance.paid <= 0 && balance.pending <= 0 ? (
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Void ${item.name}`} onClick={() => onVoidItem(item)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {saved.length ? (
          <div className="border-b border-border/60 bg-amber-500/5 px-4 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Saved · not sent yet</p>
            <ul className="space-y-1.5">
              {saved.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="tabular-nums">{item.quantity} ×</span> {item.name}
                    {item.note ? <span className="text-xs text-muted-foreground"> – {item.note}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="tabular-nums">{formatCurrency(item.line_total, currency)}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Remove ${item.name}`} onClick={() => onVoidItem(item)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            New items {newCount ? `(${newCount})` : ""}
          </p>
          {newItems.length ? (
            <ul className="space-y-2">
              {newItems.map((line) => (
                <li key={line.product_id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(line.unit_price, currency)}
                      {onNote ? (
                        <button
                          type="button"
                          className="ml-2 font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => setNoteFor(noteFor === line.product_id ? null : line.product_id)}
                        >
                          {line.note ? `– ${line.note}` : "+ Note"}
                        </button>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="outline" size="icon" className="size-9" aria-label={`Fewer ${line.name}`} onClick={() => onQty(line.product_id, line.quantity - 1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                    <Button type="button" variant="outline" size="icon" className="size-9" aria-label={`More ${line.name}`} onClick={() => onQty(line.product_id, line.quantity + 1)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  {noteFor === line.product_id ? (
                    <Input
                      autoFocus
                      className="h-10 w-full"
                      placeholder="e.g. No onions, extra cheese"
                      maxLength={200}
                      aria-label={`Note for ${line.name}`}
                      value={line.note || ""}
                      onChange={(e) => onNote(line.product_id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setNoteFor(null);
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{tab || takeaway ? "Tap menu items to add them." : "Pick a table on the floor, or open an order from Orders."}</p>
          )}
        </div>
      </div>

      <footer className="shrink-0 space-y-3 border-t border-border p-4">
        <dl className="space-y-1">
          <MoneyRow label="Subtotal" value={totals.subtotal + newTotal} currency={currency} />
          {totals.discount_amount > 0 ? <MoneyRow label="Discount" value={-totals.discount_amount} currency={currency} /> : null}
          {totals.service_charge > 0 ? (
            <MoneyRow label={`Service charge (${tab?.service_charge_rate || 0}%)`} value={totals.service_charge} currency={currency} />
          ) : null}
          {balance.paid > 0 ? <MoneyRow label="Paid" value={-balance.paid} currency={currency} muted /> : null}
          {balance.pending > 0 ? <MoneyRow label="Being confirmed" value={-balance.pending} currency={currency} muted /> : null}
          <div className="border-t border-border pt-2">
            <MoneyRow label={balance.paid > 0 ? "Due" : "Total"} value={(balance.paid > 0 ? balance.due : totals.total) + newTotal} currency={currency} strong />
          </div>
        </dl>
        {newItems.length ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button type="button" className="h-12 text-sm font-semibold uppercase tracking-wide" disabled={Boolean(busy)} onClick={onSend}>
              {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {tab && items.some((i) => i.status === "sent") ? "Send new items" : "Send to kitchen"}
            </Button>
            <Button type="button" variant="outline" className="h-12" disabled={Boolean(busy)} onClick={onSave} aria-label="Save order without sending">
              {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span className="hidden sm:inline">Save</span>
            </Button>
          </div>
        ) : saved.length ? (
          <Button type="button" className="h-12 w-full text-sm font-semibold uppercase tracking-wide" disabled={Boolean(busy)} onClick={onSend}>
            {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send to kitchen
          </Button>
        ) : null}
        {tab && readyCount > 0 && onServe ? (
          <Button type="button" variant="outline" className="h-12 w-full border-emerald-600 text-sm font-semibold uppercase tracking-wide" disabled={Boolean(busy)} onClick={onServe}>
            <CheckCircle2 className="size-4" />
            {dineIn ? "Mark served" : "Mark collected"}
          </Button>
        ) : null}
        {tab && dineIn && !balance.settled && sentCount > 0 && !tab.bill_requested_at && onRequestBill ? (
          <Button type="button" variant="ghost" className="h-11 w-full text-sm" disabled={Boolean(busy)} onClick={onRequestBill}>
            <Receipt className="size-4" />
            Request bill
          </Button>
        ) : null}
        {tab ? (
          balance.settled ? (
            <Button type="button" variant="secondary" className="h-12 w-full text-sm font-semibold uppercase tracking-wide" disabled={Boolean(busy)} onClick={onCloseTab}>
              {dineIn ? "Close table" : "Complete order"}
            </Button>
          ) : (
            <Button
              type="button"
              variant={newItems.length || saved.length ? "outline" : "default"}
              className="h-12 w-full text-sm font-semibold uppercase tracking-wide"
              disabled={Boolean(busy) || hasUnsent || balance.due <= 0}
              title={hasUnsent ? "Send or remove new items before taking payment" : undefined}
              onClick={onPay}
            >
              <Wallet className="size-4" />
              Pay {formatCurrency(balance.due, currency)}
            </Button>
          )
        ) : null}
        {hasUnsent && tab && !balance.settled ? (
          <p className="text-center text-[11px] text-muted-foreground">Send or remove new items before taking payment.</p>
        ) : null}
      </footer>
    </section>
  );
}
