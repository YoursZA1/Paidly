import { useCallback, useEffect, useState } from "react";
import { Check, Copy, LayoutGrid, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import PosOperatorsSheet from "@/components/settings/PosOperatorsSheet";
import RestaurantSetupSettings from "@/components/settings/RestaurantSetupSettings";
import { fetchRestaurantSetup } from "@/services/PosRestaurantService";
import { posAccessPath } from "@shared/posStaffInvite.js";

/** POS access: the POS link (no secrets in it) and who can open the till. */
export function PosAccessOverview() {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = posAccessPath(typeof window !== "undefined" ? window.location.origin : "https://www.paidly.co.za");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy this link", description: url });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Operators open the till with their own 6-digit POS access code — never their Paidly password. A code only works on your tills and never opens
        the dashboard.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">POS link</p>
          <p className="truncate font-mono text-sm">{url}</p>
          <p className="text-xs text-muted-foreground">
            On a new device, open a till&apos;s own link once (Registers → Copy till link). After that {url.replace(/^https?:\/\//, "")} goes straight to
            that till&apos;s code screen.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button type="button" onClick={() => setSheetOpen(true)}>
        <Users className="size-4" /> Manage POS operators
      </Button>
      <PosOperatorsSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

/** Restaurant: a one-line summary; the floor/table editor opens behind "Manage tables". */
export function RestaurantSummary() {
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchRestaurantSetup();
      setSummary({
        floors: data?.floors?.length || 0,
        tables: data?.tables?.length || 0,
        assigned: (data?.tables || []).filter((t) => t.assigned_membership_id).length,
      });
    } catch (err) {
      setSummary({ error: err?.code === "RESTAURANT_SCHEMA_MISSING" ? "Restaurant tables aren't installed on this database yet." : err?.message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium">Restaurant map</p>
        <p className="text-sm text-muted-foreground">
          {summary == null
            ? "Loading…"
            : summary.error
              ? summary.error
              : summary.tables
                ? `${summary.tables} table${summary.tables === 1 ? "" : "s"} · ${summary.floors} floor${summary.floors === 1 ? "" : "s"}${summary.assigned ? ` · ${summary.assigned} assigned to servers` : ""}`
                : "No tables yet — add floors and tables for dine-in."}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={Boolean(summary?.error)}>
        <LayoutGrid className="size-4" /> Manage tables
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) void load();
        }}
      >
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restaurant map</DialogTitle>
            <DialogDescription>Floors, tables and which server looks after each table.</DialogDescription>
          </DialogHeader>
          <RestaurantSetupSettings />
        </DialogContent>
      </Dialog>
    </div>
  );
}
