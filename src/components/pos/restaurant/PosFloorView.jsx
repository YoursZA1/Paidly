import { useEffect, useMemo, useState } from "react";
import { Loader2, ShoppingBag, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/utils/currencyCalculations";
import { cn } from "@/lib/utils";
import { TABLE_STATUS, tabLabel } from "@shared/pos/restaurant.js";
import { minutesLabel, tableDotClass, tableStatusLabel, tableToneClass } from "./posRestaurantUi";

function useWideLayout() {
  const query = "(min-width: 640px)";
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.matchMedia?.(query).matches ?? true));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return wide;
}

function TableCard({ table, currency, onClick, style }) {
  const tab = table.tab;
  const free = !tab;
  return (
    <button
      type="button"
      onClick={() => onClick(table)}
      style={style}
      className={cn(
        "flex min-h-[6.5rem] flex-col justify-between rounded-xl border-2 p-3 text-left shadow-sm transition active:scale-[0.98] touch-manipulation",
        table.shape === "round" && "rounded-[2rem]",
        tableToneClass(table.status)
      )}
      aria-label={`${tabLabel(null, table)}, ${tableStatusLabel(table.status)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-sm font-bold uppercase tracking-wide">{tabLabel(null, table)}</span>
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", tableDotClass(table.status))} aria-hidden />
      </div>
      <div className="space-y-0.5">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3" aria-hidden />
          {tab?.guests || table.seats} {tab?.guests ? "pax" : "seats"}
          {tab?.server_display || table.assigned_name ? (
            <span className="ml-auto truncate">· {tab?.server_display || table.assigned_name}</span>
          ) : null}
        </p>
        {free ? (
          <p className="text-sm font-semibold">{table.status === TABLE_STATUS.CLEANING ? "Cleaning" : "Free"}</p>
        ) : (
          <>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(tab.balance?.due ?? tab.totals.total, currency)}</p>
            <p className="text-[11px] text-muted-foreground">
              {tableStatusLabel(table.status)}
              {tab.minutes_open != null ? ` · ${minutesLabel(tab.minutes_open)}` : ""}
            </p>
          </>
        )}
      </div>
    </button>
  );
}

/**
 * Floor plan: floors as tabs, tables positioned on their grid, live status at a glance.
 * Tapping a free table seats guests (opens a tab); tapping an occupied table opens its order.
 */
export default function PosFloorView({ floorState, loading, currency, onOpenTab, onSeatTable, onMarkClean, onOpenTakeaway, canSell, myMembershipId = null }) {
  const floors = floorState?.floors || [];
  const [floorId, setFloorId] = useState(null);
  const [seatTable, setSeatTable] = useState(null);
  const [guests, setGuests] = useState("2");
  const [busy, setBusy] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const wide = useWideLayout();
  const activeFloorId = floorId && floors.some((f) => f.id === floorId) ? floorId : floors[0]?.id || null;
  // "My tables": tables assigned to me or whose open order I'm serving. One operator can have many.
  const isMine = (t) => Boolean(myMembershipId) && (t.assigned_membership_id === myMembershipId || t.tab?.server_membership_id === myMembershipId);
  const tables = useMemo(
    () => (floorState?.tables || []).filter((t) => t.floor_id === activeFloorId && (!mineOnly || isMine(t))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isMine depends only on myMembershipId
    [floorState, activeFloorId, mineOnly, myMembershipId]
  );
  const cols = Math.min(12, Math.max(4, ...tables.map((t) => (Number(t.pos_x) || 0) + 1)));
  const takeaway = floorState?.takeaway || [];

  const tap = (table) => {
    if (table.tab) return onOpenTab(table.tab.id);
    if (table.status === TABLE_STATUS.CLEANING) return onMarkClean(table);
    if (!canSell) return;
    setGuests(String(Math.min(table.seats || 2, 20)));
    setSeatTable(table);
  };

  const confirmSeat = async () => {
    if (!seatTable) return;
    setBusy(true);
    try {
      await onSeatTable(seatTable, Math.max(1, Math.trunc(Number(guests) || 1)));
      setSeatTable(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !floorState) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!floors.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-lg font-semibold">No floor plan yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add your floors and tables in Settings → Integrations → Restaurant setup. Until then you can take Takeaway and Counter orders.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2" role="tablist" aria-label="Floors">
        {floors.map((floor) => (
          <Button
            key={floor.id}
            type="button"
            role="tab"
            aria-selected={floor.id === activeFloorId}
            variant={floor.id === activeFloorId ? "default" : "outline"}
            className="h-10 shrink-0 px-4"
            onClick={() => setFloorId(floor.id)}
          >
            {floor.name}
          </Button>
        ))}
        {myMembershipId ? (
          <div className="ml-auto flex shrink-0 rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Which tables">
            {[
              [false, "All tables"],
              [true, "My tables"],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={mineOnly === value}
                className={cn("min-h-9 rounded-md px-3 text-sm", mineOnly === value ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                onClick={() => setMineOnly(value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-28 lg:pb-3">
        {wide ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(6.5rem, 1fr))` }}>
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                currency={currency}
                onClick={tap}
                style={{ gridColumnStart: (Number(table.pos_x) || 0) + 1, gridRowStart: (Number(table.pos_y) || 0) + 1 }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[...tables]
              .sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x)
              .map((table) => (
                <TableCard key={table.id} table={table} currency={currency} onClick={tap} />
              ))}
          </div>
        )}

        {takeaway.length ? (
          <section className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open takeaway orders</h3>
            <div className="flex flex-wrap gap-2">
              {takeaway.map((tab) => (
                <Button key={tab.id} type="button" variant="outline" className="h-auto min-h-11 flex-col items-start px-3 py-2" onClick={() => onOpenTakeaway(tab.id)}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <ShoppingBag className="size-3.5" /> #{tab.order_number}
                    {tab.customer_name ? ` · ${tab.customer_name}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(tab.balance?.due ?? tab.totals.total, currency)} · {tab.kitchen.state === "ready" ? "Ready" : tab.kitchen.live ? "Preparing" : "Open"}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Dialog open={Boolean(seatTable)} onOpenChange={(open) => !open && setSeatTable(null)}>
        <DialogContent className="max-w-sm sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Seat {seatTable ? tabLabel(null, seatTable) : ""}</DialogTitle>
            <DialogDescription>Opens one running order for this table. Add rounds to it until the bill is paid.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pos-seat-guests">Guests</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <Button key={n} type="button" variant={String(n) === guests ? "default" : "outline"} className="h-11 w-11" onClick={() => setGuests(String(n))}>
                  {n}
                </Button>
              ))}
              <Input id="pos-seat-guests" inputMode="numeric" className="h-11 w-20" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="button" className="h-12 w-full" disabled={busy} onClick={() => void confirmSeat()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Open table
            </Button>
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => setSeatTable(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
