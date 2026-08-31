import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Client } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  WALK_IN_CUSTOMER_LABEL,
  filterPosCustomers,
  formatPosCustomerPhone,
  mergePosCustomerResults,
} from "@/lib/pos/posCustomerSearch";
import { listPosCustomers, searchPosCustomers } from "@/lib/pos/searchPosCustomers";

const EMPTY_DRAFT = { name: "", phone: "" };

export default function PosCustomerDialog({
  open,
  onOpenChange,
  orgId,
  selectedId,
  onSelectWalkIn,
  onSelectClient,
  onCreated,
  allowWalkIn = true,
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [listed, setListed] = useState([]);
  const [remote, setRemote] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setRemote([]);
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      return;
    }
    if (!orgId) {
      setListed([]);
      return;
    }
    let cancelled = false;
    setLoadingList(true);
    void listPosCustomers(orgId, { limit: 20 })
      .then((rows) => {
        if (!cancelled) setListed(rows);
      })
      .catch(() => {
        if (!cancelled) setListed([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  useEffect(() => {
    if (!open || createOpen) return;
    const q = query.trim();
    if (q.length < 2 || !orgId) {
      setRemote([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPosCustomers(orgId, q)
        .then((rows) => {
          if (!cancelled) setRemote(rows);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, createOpen, orgId, query]);

  const matches = useMemo(
    () => mergePosCustomerResults(filterPosCustomers(listed, query, 12), remote, 12),
    [listed, query, remote]
  );

  const selectWalkIn = () => {
    onSelectWalkIn();
    onOpenChange(false);
  };

  const selectClient = (client) => {
    onSelectClient(client);
    onOpenChange(false);
  };

  const openCreate = () => {
    setDraft({ name: query.trim(), phone: "" });
    setCreateOpen(true);
  };

  const saveCustomer = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a POS customer name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const created = await Client.create({
        name,
        phone: draft.phone.trim() || null,
        pos_enabled: true,
      });
      if (!created?.id) throw new Error("POS customer could not be created.");
      const posCustomer = {
        id: created.id,
        name: created.name,
        phone: created.phone || null,
        pos_enabled: true,
      };
      onCreated?.(posCustomer);
      onSelectClient(posCustomer);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not create POS customer",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>POS Customer</DialogTitle>
          <DialogDescription>
            {allowWalkIn
              ? `Optional for cash sales. ${WALK_IN_CUSTOMER_LABEL} is the default — do not create a record for every ticket.`
              : "A tax invoice needs a named POS customer. Walk-in cannot be converted."}
          </DialogDescription>
        </DialogHeader>

        {createOpen ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pos-customer-name">Name</Label>
              <Input
                id="pos-customer-name"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="POS customer name"
                className="h-12"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-customer-phone">Phone</Label>
              <Input
                id="pos-customer-phone"
                value={draft.phone}
                onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
                className="h-12"
                inputMode="tel"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-stretch">
              <Button type="button" variant="ghost" className="h-12" onClick={() => setCreateOpen(false)}>
                Back
              </Button>
              <Button type="button" className="h-12 flex-1" disabled={saving} onClick={() => void saveCustomer()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save POS customer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search POS customers"
                className="h-12 pl-10"
                autoComplete="off"
                aria-label="Search POS customers"
              />
            </div>
            <ul className="max-h-64 space-y-2 overflow-auto">
              {allowWalkIn ? (
                <li>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-3 text-left hover:bg-muted",
                      !selectedId ? "border-primary bg-muted/60" : ""
                    )}
                    onClick={selectWalkIn}
                  >
                    <span>
                      <span className="block text-sm font-medium">{WALK_IN_CUSTOMER_LABEL}</span>
                      <span className="block text-xs text-muted-foreground">No customer record required</span>
                    </span>
                    {!selectedId ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                </li>
              ) : null}
              {loadingList && matches.length === 0 ? (
                <li className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading POS customers
                </li>
              ) : null}
              {matches.length > 0 ? (
                <li className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  POS Customers
                </li>
              ) : null}
              {matches.map((client) => {
                const phone = formatPosCustomerPhone(client.phone);
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-3 text-left hover:bg-muted",
                        selectedId === client.id ? "border-primary bg-muted/60" : ""
                      )}
                      onClick={() => selectClient(client)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{client.name}</span>
                        {phone ? (
                          <span className="block truncate text-xs text-muted-foreground">{phone}</span>
                        ) : null}
                      </span>
                      {selectedId === client.id ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
              {query.trim() && matches.length === 0 && !searching && !loadingList ? (
                <li className="px-1 py-3 text-sm text-muted-foreground">No matching POS customers.</li>
              ) : null}
            </ul>
            <Button type="button" variant="outline" className="h-12 w-full" onClick={openCreate}>
              <UserPlus className="size-4" />
              New POS Customer
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
