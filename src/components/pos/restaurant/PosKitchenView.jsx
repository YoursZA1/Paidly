import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChefHat, Loader2, RotateCcw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { KITCHEN_STATUS, minutesSince, stationLabel } from "@shared/pos/restaurant.js";
import { fetchKitchen, moveKitchenTicket } from "@/services/PosRestaurantService";
import { clockTime, minutesLabel } from "./posRestaurantUi";

const POLL_MS = 5000;

const COLUMNS = [
  { status: KITCHEN_STATUS.NEW, title: "New", action: { next: KITCHEN_STATUS.PREPARING, label: "Accept" }, tone: "border-sky-500/50" },
  { status: KITCHEN_STATUS.PREPARING, title: "Preparing", action: { next: KITCHEN_STATUS.READY, label: "Ready" }, tone: "border-amber-500/60" },
  { status: KITCHEN_STATUS.READY, title: "Ready", action: { next: KITCHEN_STATUS.COMPLETED, label: "Complete" }, tone: "border-emerald-600" },
];

function Ticket({ ticket, column, busy, onMove }) {
  const age = minutesSince(ticket.sent_at);
  const late = age != null && age >= 15 && ticket.status !== KITCHEN_STATUS.READY;
  return (
    <article className={cn("rounded-xl border-2 bg-card p-3 shadow-sm", column.tone, late && "ring-2 ring-destructive/60")}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-display text-base font-bold uppercase">
            {ticket.order_type === "takeaway" ? <ShoppingBag className="size-4" aria-hidden /> : null}
            {ticket.table_label || "Order"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            KOT #{ticket.ticket_number} · {stationLabel(ticket.station)}
            {ticket.server_name ? ` · ${ticket.server_name}` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 text-xs tabular-nums", late ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {clockTime(ticket.sent_at)} · {minutesLabel(age)}
        </span>
      </header>
      <ul className="space-y-1">
        {(ticket.items || []).map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
            {item.note ? <p className="pl-5 text-xs font-medium text-amber-700 dark:text-amber-300">– {item.note}</p> : null}
          </li>
        ))}
      </ul>
      {ticket.note ? <p className="mt-2 rounded bg-muted px-2 py-1 text-xs">{ticket.note}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" className="h-11 flex-1 text-sm font-semibold uppercase" disabled={busy} onClick={() => onMove(ticket, column.action.next)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : column.status === KITCHEN_STATUS.READY ? <CheckCircle2 className="size-4" /> : null}
          {column.action.label}
        </Button>
        {column.status === KITCHEN_STATUS.READY ? (
          <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Back to preparing" disabled={busy} onClick={() => onMove(ticket, KITCHEN_STATUS.PREPARING)}>
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Kitchen display: live tickets per station, oldest first. Anyone with POS access can work it. */
export default function PosKitchenView() {
  const { toast } = useToast();
  const [station, setStation] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchKitchen(station || undefined));
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not load the kitchen");
    }
  }, [station]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const move = async (ticket, next) => {
    setBusyId(ticket.id);
    try {
      await moveKitchenTicket(ticket.id, next);
      await load();
    } catch (err) {
      toast({ title: "Ticket not updated", description: err?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const tickets = data?.tickets || [];
  const stations = data?.stations || ["kitchen", "bar"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-2">
        <ChefHat className="mr-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Button type="button" variant={station === "" ? "default" : "outline"} className="h-10 shrink-0" onClick={() => setStation("")}>
          All stations
        </Button>
        {stations.map((s) => (
          <Button key={s} type="button" variant={station === s ? "default" : "outline"} className="h-10 shrink-0" onClick={() => setStation(s)}>
            {stationLabel(s)}
          </Button>
        ))}
      </div>
      {error ? <p className="px-3 text-sm text-destructive">{error}</p> : null}
      {!data && !error ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-3 pb-28 md:grid-cols-3 lg:pb-3">
          {COLUMNS.map((column) => {
            const list = tickets.filter((t) => t.status === column.status);
            return (
              <section key={column.status} className="flex min-h-0 flex-col gap-2" aria-label={column.title}>
                <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {column.title}
                  <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{list.length}</span>
                </h3>
                {list.length ? (
                  list.map((ticket) => <Ticket key={ticket.id} ticket={ticket} column={column} busy={busyId === ticket.id} onMove={move} />)
                ) : (
                  <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nothing {column.title.toLowerCase()}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
