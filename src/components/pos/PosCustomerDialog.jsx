import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
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
import { isValidEmail } from "@/utils/inputSanitization";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  WALK_IN_CUSTOMER_LABEL,
  filterPosCustomers,
  mergePosCustomerResults,
} from "@/lib/pos/posCustomerSearch";
import { searchPosCustomers } from "@/lib/pos/searchPosCustomers";

const EMPTY_DRAFT = { name: "", phone: "", email: "" };

export default function PosCustomerDialog({
  open,
  onOpenChange,
  clients,
  orgId,
  selectedId,
  onSelectWalkIn,
  onSelectClient,
  onCreated,
  allowWalkIn = true,
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState([]);
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
    }
  }, [open]);

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
    () => mergePosCustomerResults(filterPosCustomers(clients, query, 12), remote, 12),
    [clients, query, remote]
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
    setDraft({ name: query.trim(), phone: "", email: "" });
    setCreateOpen(true);
  };

  const saveCustomer = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a customer name.", variant: "destructive" });
      return;
    }
    const email = draft.email.trim();
    if (email && !isValidEmail(email)) {
      toast({ title: "Invalid email", description: "Fix the email or leave it blank.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const created = await Client.create({
        name,
        email: email || null,
        phone: draft.phone.trim() || null,
      });
      if (!created?.id) throw new Error("Customer could not be created.");
      onCreated?.(created);
      onSelectClient(created);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not create customer",
        description: err?.message || "Try again, or add them under Clients.",
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
          <DialogTitle>Customer</DialogTitle>
          <DialogDescription>
            {allowWalkIn
              ? `Optional for cash sales. ${WALK_IN_CUSTOMER_LABEL} is the default — do not create a record for every ticket.`
              : "A tax invoice needs a named customer. Walk-in cannot be converted."}
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
                placeholder="Customer name"
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
            <div className="space-y-1">
              <Label htmlFor="pos-customer-email">Email</Label>
              <Input
                id="pos-customer-email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Optional"
                className="h-12"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-stretch">
              <Button type="button" variant="ghost" className="h-12" onClick={() => setCreateOpen(false)}>
                Back
              </Button>
              <Button type="button" className="h-12 flex-1" disabled={saving} onClick={() => void saveCustomer()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save customer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, or phone"
              className="h-12"
              autoComplete="off"
              aria-label="Search customers"
            />
            <ul className="max-h-56 overflow-auto rounded-xl border border-border">
              {allowWalkIn ? (
              <li>
                <button
                  type="button"
                  className={cn(
                    "flex h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-muted",
                    !selectedId ? "bg-muted/60 font-medium" : ""
                  )}
                  onClick={selectWalkIn}
                >
                  <span>{WALK_IN_CUSTOMER_LABEL}</span>
                  {!selectedId ? <Check className="size-4 shrink-0" /> : null}
                </button>
              </li>
              ) : null}
              {matches.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex h-14 w-full flex-col justify-center px-3 text-left hover:bg-muted",
                      selectedId === client.id ? "bg-muted/60" : ""
                    )}
                    onClick={() => selectClient(client)}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{client.name}</span>
                      {selectedId === client.id ? <Check className="size-4 shrink-0" /> : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[client.phone, client.email].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </button>
                </li>
              ))}
              {query.trim() && matches.length === 0 && !searching ? (
                <li className="px-3 py-4 text-sm text-muted-foreground">No matching customers.</li>
              ) : null}
            </ul>
            <Button type="button" variant="outline" className="h-12 w-full" onClick={openCreate}>
              <UserPlus className="size-4" />
              New customer
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
