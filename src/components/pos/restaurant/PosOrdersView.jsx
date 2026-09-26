import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/currencyCalculations";
import { cn } from "@/lib/utils";
import { fetchRestaurantOrders } from "@/services/PosRestaurantService";
import { clockTime, minutesLabel, tableDotClass, tableStatusLabel } from "./posRestaurantUi";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "kitchen", label: "Kitchen" },
  { id: "ready", label: "Ready" },
  { id: "payment", label: "Payment" },
];

function matches(order, filter) {
  if (filter === "all") return true;
  if (filter === "dine_in" || filter === "takeaway") return order.order_type === filter;
  if (filter === "kitchen") return order.kitchen.state === "preparing";
  if (filter === "ready") return order.kitchen.state === "ready";
  if (filter === "payment") return Boolean(order.bill_requested_at) || order.balance.pending > 0 || (order.balance.paid > 0 && !order.balance.settled);
  return true;
}

function statusText(order) {
  if (order.table_status) return tableStatusLabel(order.table_status);
  if (order.balance.settled) return "Paid";
  if (order.kitchen.state === "ready") return "Ready";
  if (order.kitchen.state === "preparing") return "Preparing";
  return "Open";
}

function OrderRow({ order, currency, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen?.(order.id)} disabled={!onOpen} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/50 disabled:cursor-default">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {order.table_status ? <span className={cn("size-2 rounded-full", tableDotClass(order.table_status))} aria-hidden /> : null}
          <span className="truncate">{order.label}</span>
          {order.customer_name ? <span className="truncate text-sm text-muted-foreground">· {order.customer_name}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          #{order.order_number} · {statusText(order)}
          {order.server_name ? ` · ${order.server_name}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums">{formatCurrency(order.status === "closed" ? order.totals.total : order.balance.due, currency)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {order.status === "closed" ? clockTime(order.closed_at) : minutesLabel(order.minutes_open)}
        </p>
      </div>
    </button>
  );
}

/** Live dine-in and takeaway orders plus today's completed ones, with quick filters. */
export default function PosOrdersView({ currency, onOpenTab }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      setData(await fetchRestaurantOrders());
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not load orders");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const live = useMemo(() => (data?.live || []).filter((o) => matches(o, filter)), [data, filter]);
  const takeaway = useMemo(() => (data?.takeaway || []).filter((o) => matches(o, filter)), [data, filter]);
  const completed = filter === "all" ? data?.completed || [] : [];

  const section = (title, rows, open = true) => (
    <section className="mb-4">
      <h3 className="mb-1 flex items-center justify-between px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        <span className="tabular-nums">{rows.length}</span>
      </h3>
      <div className="rounded-xl border border-border bg-card">
        {rows.length ? (
          rows.map((order) => <OrderRow key={order.id} order={order} currency={currency} onOpen={open ? onOpenTab : null} />)
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">None</p>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2">
        {FILTERS.map((f) => (
          <Button key={f.id} type="button" variant={filter === f.id ? "default" : "outline"} className="h-10 shrink-0" onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>
      {error ? <p className="px-3 text-sm text-destructive">{error}</p> : null}
      {!data && !error ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 lg:pb-3">
          {filter !== "takeaway" ? section("Live tables", live) : null}
          {filter !== "dine_in" ? section("Takeaway", takeaway) : null}
          {filter === "all" ? section("Completed today", completed, false) : null}
        </div>
      )}
    </div>
  );
}
