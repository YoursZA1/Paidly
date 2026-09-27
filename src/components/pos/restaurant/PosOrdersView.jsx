import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, CheckCircle2, Loader2, Plus, Receipt, Scissors, ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/utils/currencyCalculations";
import { cn } from "@/lib/utils";
import {
  KITCHEN_STATUS,
  ORDER_STAGE,
  ORDER_STAGE_LABEL,
  ORDER_TYPE,
  PAYMENT_STATE,
  PAYMENT_STATE_LABEL,
  STATUS_FILTER,
  STATUS_FILTER_OPTIONS,
  kitchenQueue,
  matchesOrderType,
  matchesStatusFilter,
  minutesSince,
  statusFilterCounts,
} from "@shared/pos/restaurant.js";
import { fetchRestaurantOrders, moveKitchenTicket } from "@/services/PosRestaurantService";
import { KitchenTicket } from "./PosKitchenView";
import { KITCHEN_COLUMNS, clockTime, minutesLabel, tableDotClass } from "./posRestaurantUi";

const POLL_MS = 8000;

const STAGE_TONE = {
  [ORDER_STAGE.OPEN]: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  [ORDER_STAGE.KITCHEN]: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  [ORDER_STAGE.READY]: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  [ORDER_STAGE.SERVED]: "bg-muted text-muted-foreground",
};
const PAYMENT_TONE = {
  [PAYMENT_STATE.UNPAID]: "bg-violet-500/10 text-violet-900 dark:text-violet-200",
  [PAYMENT_STATE.PARTIAL]: "bg-violet-500/10 text-violet-900 dark:text-violet-200",
  [PAYMENT_STATE.PENDING]: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  [PAYMENT_STATE.PAID]: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
};

const TYPE_NOUN = { [ORDER_TYPE.DINE_IN]: "table", [ORDER_TYPE.TAKEAWAY]: "takeaway", [ORDER_TYPE.COUNTER]: "counter" };

/** Poll while visible, refresh at once when the tab comes back or this till changes something. */
function useLiveOrders(refreshKey) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await fetchRestaurantOrders());
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not load orders");
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  return { data, error, reload: load };
}

function Chip({ className, children }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>{children}</span>;
}

function linesPreview(lines = [], max = 3) {
  const shown = lines.slice(0, max);
  return { shown, more: Math.max(0, lines.length - shown.length) };
}

/** Compact order card: who / what / how much / how long, stage and payment side by side. */
function OrderCard({ order, currency, onOpen, children, showLines = true }) {
  const { shown, more } = linesPreview(order.lines, 3);
  const settledOrClosed = order.status === "closed" || order.payment_state === PAYMENT_STATE.PAID;
  const amount = settledOrClosed ? order.totals.total : order.balance.due;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => onOpen?.(order.id)}
        disabled={!onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 text-left hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
        aria-label={`Open ${order.label}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 font-display text-base font-bold uppercase tracking-wide">
            {order.table_status ? <span className={cn("size-2 shrink-0 rounded-full", tableDotClass(order.table_status))} aria-hidden /> : null}
            {order.order_type !== ORDER_TYPE.DINE_IN ? <ShoppingBag className="size-4 shrink-0" aria-hidden /> : null}
            <span className="truncate">{order.label}</span>
          </p>
          <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(amount, currency)}</p>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          #{order.order_number}
          {order.customer_name ? ` · ${order.customer_name}` : ""}
          {order.guests ? ` · ${order.guests} guest${order.guests === 1 ? "" : "s"}` : ""}
          {order.server_display || order.server_name ? ` · ${order.server_display || order.server_name}` : ""}
          {" · "}
          {order.status === "closed" ? `Closed ${clockTime(order.closed_at)}` : minutesLabel(order.minutes_open)}
        </p>
        <div className="flex flex-wrap gap-1">
          {order.status === "closed" ? (
            <Chip className="bg-muted text-muted-foreground">Completed</Chip>
          ) : (
            <>
              <Chip className={STAGE_TONE[order.stage]}>{ORDER_STAGE_LABEL[order.stage] || "Open"}</Chip>
              {order.payment_state !== PAYMENT_STATE.NONE ? (
                <Chip className={PAYMENT_TONE[order.payment_state]}>{PAYMENT_STATE_LABEL[order.payment_state]}</Chip>
              ) : null}
              {order.bill_requested_at && order.payment_state !== PAYMENT_STATE.PAID ? <Chip className="bg-violet-500/10 text-violet-900 dark:text-violet-200">Bill requested</Chip> : null}
              {order.payment_failed ? <Chip className="bg-destructive/10 text-destructive">Last payment failed</Chip> : null}
              {order.pending_items > 0 ? <Chip className="bg-amber-500/15 text-amber-900 dark:text-amber-200">{order.pending_items} not sent</Chip> : null}
            </>
          )}
        </div>
        {showLines && shown.length ? (
          <ul className="space-y-0.5 text-sm">
            {shown.map((line) => (
              <li key={line.id} className="truncate">
                <span className="font-semibold tabular-nums">{line.quantity} ×</span> {line.name}
              </li>
            ))}
            {more ? <li className="text-xs text-muted-foreground">+{more} more</li> : null}
          </ul>
        ) : null}
      </button>
      {children ? <div className="flex flex-wrap gap-2 border-t border-border/60 p-2">{children}</div> : null}
    </article>
  );
}

function EmptyState({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action || null}
    </div>
  );
}

const grid = "grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3";

/**
 * Orders: ORDER TYPE (top navigation) × STATUS (All · Active · Kitchen · Ready · Payment), from one
 * live feed — changing filters never refetches. Kitchen is the real KOT queue; Ready hands food
 * over; Payment takes money through the Payment Engine (the bill dialog). Stage and payment stay
 * separate: a ready, unpaid order shows under both Ready and Payment.
 */
export default function PosOrdersView({
  orderType = ORDER_TYPE.DINE_IN,
  currency,
  canSell = true,
  refreshKey = 0,
  onOpenTab,
  onPay,
  onServe,
  onNewOrder,
  onKitchenChanged,
}) {
  const { toast } = useToast();
  const { data, error, reload } = useLiveOrders(refreshKey);
  const [filter, setFilter] = useState(STATUS_FILTER.ALL);
  const [busyId, setBusyId] = useState(null);

  const orders = useMemo(() => data?.orders || [], [data]);
  const tickets = useMemo(() => data?.tickets || [], [data]);
  const counts = useMemo(() => statusFilterCounts({ orders, tickets }, orderType), [orders, tickets, orderType]);
  const scoped = useMemo(() => orders.filter((o) => matchesOrderType(o, orderType)), [orders, orderType]);
  const visible = useMemo(() => {
    if (filter === STATUS_FILTER.KITCHEN) return [];
    const list = scoped.filter((o) => matchesStatusFilter(o, filter));
    // Oldest open work first; completed orders last (newest first).
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      if (a.status === "closed") return String(b.closed_at).localeCompare(String(a.closed_at));
      return String(a.opened_at).localeCompare(String(b.opened_at));
    });
  }, [scoped, filter]);
  const queue = useMemo(() => kitchenQueue(tickets, orderType), [tickets, orderType]);

  const run = async (id, fn) => {
    setBusyId(id);
    try {
      await fn();
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const moveTicket = (ticket, next) =>
    run(ticket.id, async () => {
      try {
        await moveKitchenTicket(ticket.id, next);
        onKitchenChanged?.();
      } catch (err) {
        toast({ title: "Ticket not updated", description: err?.message, variant: "destructive" });
      }
    });

  const serve = (order) => run(order.id, async () => onServe?.(order.id));

  const noun = TYPE_NOUN[orderType] || "order";
  const newOrderAction =
    canSell && onNewOrder ? (
      <Button type="button" className="h-11" onClick={onNewOrder}>
        <Plus className="size-4" />
        {orderType === ORDER_TYPE.DINE_IN ? "Open the floor" : orderType === ORDER_TYPE.TAKEAWAY ? "New takeaway order" : "New counter sale"}
      </Button>
    ) : null;

  const emptyFor = () => {
    switch (filter) {
      case STATUS_FILTER.KITCHEN:
        return <EmptyState title="No orders waiting for the kitchen." hint="When a new order is sent, it appears here." />;
      case STATUS_FILTER.READY:
        return (
          <EmptyState
            title={orderType === ORDER_TYPE.DINE_IN ? "No orders are ready to serve." : "No orders are ready for collection."}
            hint="Orders appear here when the kitchen marks them ready."
          />
        );
      case STATUS_FILTER.PAYMENT:
        return <EmptyState title="No orders are waiting for payment." />;
      default:
        return orderType === ORDER_TYPE.DINE_IN ? (
          <EmptyState title="No active table orders." hint="Choose a table from the floor to start an order." action={newOrderAction} />
        ) : (
          <EmptyState title={`No active ${noun} orders.`} action={newOrderAction} />
        );
    }
  };

  const orderActions = (order) => {
    const busy = busyId === order.id;
    const ready = Number(order.kitchen?.ready) > 0;
    const canPay = order.status === "open" && order.payment_state !== PAYMENT_STATE.PAID && order.balance.available > 0;
    const actions = [];
    if (filter === STATUS_FILTER.READY && ready && canSell) {
      actions.push(
        <Button key="serve" type="button" className="h-11 flex-1" disabled={busy} onClick={() => void serve(order)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {order.order_type === ORDER_TYPE.DINE_IN ? "Mark served" : order.payment_state === PAYMENT_STATE.PAID ? "Collected · complete" : "Mark collected"}
        </Button>
      );
    }
    if ((filter === STATUS_FILTER.PAYMENT || filter === STATUS_FILTER.READY) && canSell && order.status === "open") {
      if (order.payment_state === PAYMENT_STATE.PENDING && !canPay) {
        actions.push(
          <p key="pending" className="flex min-h-11 flex-1 items-center text-xs text-muted-foreground">
            Waiting for the provider to confirm — updates automatically.
          </p>
        );
      } else if (canPay && filter === STATUS_FILTER.PAYMENT) {
        const blocked = order.pending_items > 0;
        actions.push(
          <Button key="pay" type="button" className="h-11 flex-1" disabled={blocked} title={blocked ? "Send or remove new items first" : undefined} onClick={() => onPay?.(order.id, "full")}>
            <Wallet className="size-4" />
            Pay {formatCurrency(order.balance.available, currency)}
          </Button>,
          <Button key="split" type="button" variant="outline" className="h-11" disabled={blocked} onClick={() => onPay?.(order.id, "equal")}>
            <Scissors className="size-4" />
            Split bill
          </Button>
        );
      } else if (canPay && filter === STATUS_FILTER.READY) {
        actions.push(
          <Button key="pay" type="button" variant="outline" className="h-11" onClick={() => onPay?.(order.id, "full")}>
            <Wallet className="size-4" />
            Pay
          </Button>
        );
      }
    }
    return actions.length ? actions : null;
  };

  const kitchenColumns = KITCHEN_COLUMNS.filter((c) => c.status !== KITCHEN_STATUS.READY);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 px-3 py-2" role="tablist" aria-label="Order status">
        {STATUS_FILTER_OPTIONS.map((f) => (
          <Button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            variant={filter === f.id ? "default" : "outline"}
            className="h-10 shrink-0 gap-1.5 px-3"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span
              className={cn(
                "min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                filter === f.id ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
              )}
            >
              {data ? counts[f.id] : "–"}
            </span>
          </Button>
        ))}
      </div>
      {error ? <p className="px-3 pb-2 text-sm text-destructive">{error}</p> : null}
      {!data && !error ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 lg:pb-3">
          {filter === STATUS_FILTER.KITCHEN ? (
            queue.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {kitchenColumns.map((column) => {
                  const list = queue.filter((t) => t.status === column.status);
                  return (
                    <section key={column.status} className="flex min-w-0 flex-col gap-2" aria-label={column.title}>
                      <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <ChefHat className="size-3.5" aria-hidden />
                          {column.title}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{list.length}</span>
                      </h3>
                      {list.length ? (
                        list.map((ticket) => (
                          <KitchenTicket key={ticket.id} ticket={ticket} column={column} busy={busyId === ticket.id} onMove={moveTicket} />
                        ))
                      ) : (
                        <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                          {column.status === KITCHEN_STATUS.NEW ? "No new tickets." : "Nothing being prepared."}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              emptyFor()
            )
          ) : visible.length ? (
            <>
              <div className={grid}>
                {visible
                  .filter((o) => o.status === "open")
                  .map((order) => (
                    <OrderCard key={order.id} order={order} currency={currency} onOpen={onOpenTab}>
                      {orderActions(order)}
                    </OrderCard>
                  ))}
              </div>
              {!visible.some((o) => o.status === "open") ? emptyFor() : null}
              {filter === STATUS_FILTER.ALL && visible.some((o) => o.status === "closed") ? (
                <section className="mt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Receipt className="size-3.5" aria-hidden />
                    Completed today
                  </h3>
                  <div className={grid}>
                    {visible
                      .filter((o) => o.status === "closed")
                      .map((order) => (
                        <OrderCard key={order.id} order={order} currency={currency} showLines={false} />
                      ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            emptyFor()
          )}
          {data?.generated_at ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Updated {clockTime(data.generated_at)} · refreshes automatically
              {filter === STATUS_FILTER.KITCHEN && queue[0] ? ` · oldest waiting ${minutesLabel(minutesSince(queue[0].sent_at))}` : ""}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
