import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/utils/currencyCalculations";
import { listPosRegisters, listPosSessions } from "@/services/PosIntegrationService";

export const RECENT_SHIFT_COUNT = 3;

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === today.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString()} · ${time}`;
}

function ShiftRow({ shift, currency }) {
  const open = shift.status === "open";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={open ? "default" : "outline"}>{open ? "Open" : "Closed"}</Badge>
          <span className="truncate">{shift.register_name || "Till"}</span>
          <span className="truncate text-muted-foreground">· {shift.opened_by_name || "Staff"}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dayLabel(open ? shift.opened_at : shift.closed_at || shift.opened_at)}
          {!open && shift.variance != null ? ` · variance ${formatCurrency(shift.variance, currency)}` : ""}
        </p>
      </div>
      <p className="text-sm font-semibold tabular-nums">{formatCurrency(shift.cash_sales || 0, currency)}</p>
    </li>
  );
}

/**
 * POS settings → Recent shifts: the latest 3, with the full history behind "View all shifts".
 * Presentation only — no shift data is removed.
 */
export default function PosRecentShifts() {
  const { profile, user } = useAuth();
  const currency = profile?.currency || user?.currency || "ZAR";
  const [recent, setRecent] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const [registers, setRegisters] = useState([]);

  useEffect(() => {
    listPosRegisters()
      .then((data) => setRegisters(data?.registers || []))
      .catch(() => setRegisters([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPosSessions({ limit: RECENT_SHIFT_COUNT })
      .then((rows) => {
        if (!cancelled) setRecent(rows.slice(0, RECENT_SHIFT_COUNT));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      {recent == null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : recent.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {recent.map((shift) => (
            <ShiftRow key={shift.id} shift={shift} currency={currency} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No shifts yet.</p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setAllOpen(true)}>
        <History className="size-4" /> View all shifts
      </Button>
      {allOpen ? <ShiftHistoryDialog registers={registers} currency={currency} onClose={() => setAllOpen(false)} /> : null}
    </div>
  );
}

function ShiftHistoryDialog({ registers, currency, onClose }) {
  const [status, setStatus] = useState("all");
  const [registerId, setRegisterId] = useState("all");
  const [operatorId, setOperatorId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(null);
  const [operators, setOperators] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await listPosSessions({
        limit: 100,
        status: status === "all" ? undefined : status,
        register_id: registerId === "all" ? undefined : registerId,
        operator_membership_id: operatorId === "all" ? undefined : operatorId,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(data);
      // Operator choices from what the history contains (names resolve server-side).
      setOperators((prev) => {
        const map = new Map(prev.map((o) => [o.id, o.name]));
        for (const s of data) if (s.opened_by_membership_id) map.set(s.opened_by_membership_id, s.opened_by_name || "Staff");
        return [...map.entries()].map(([id, name]) => ({ id, name }));
      });
    } catch (err) {
      setError(err?.message || "Could not load shifts");
      setRows([]);
    }
  }, [status, registerId, operatorId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => (rows || []).reduce((sum, s) => sum + (Number(s.cash_sales) || 0), 0), [rows]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>All shifts</DialogTitle>
          <DialogDescription>Read-only history. Counted cash and variance can&apos;t be edited after a shift closes.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="sh-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="sh-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sh-register">Register</Label>
            <Select value={registerId} onValueChange={setRegisterId}>
              <SelectTrigger id="sh-register">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All registers</SelectItem>
                {registers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sh-operator">Operator</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger id="sh-operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All operators</SelectItem>
                {operators.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sh-from">From</Label>
            <Input id="sh-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sh-to">To</Label>
            <Input id="sh-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {rows == null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : rows.length ? (
          <>
            <p className="text-xs text-muted-foreground">
              {rows.length} shift{rows.length === 1 ? "" : "s"} · cash sales {formatCurrency(total, currency)}
              {rows.length === 100 ? " · showing the latest 100 — narrow the dates to see older shifts" : ""}
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} currency={currency} />
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No shifts match these filters.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
