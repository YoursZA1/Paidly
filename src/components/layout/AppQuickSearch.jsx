import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Package, FileText, Loader2 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DialogDescription } from "@/components/ui/dialog";
import { useAppStore } from "@/stores/useAppStore";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthContext";

const MAX_PER_GROUP = 8;
const OPEN_EVENT = "paidly:open-quick-search";

function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function matches(hay, term) {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return normalize(hay).includes(t);
}

function clientHaystack(c) {
  return [c.name, c.client_name, c.full_name, c.email, c.company, c.company_name, c.phone, c.contact_name]
    .filter(Boolean)
    .join(" ");
}

function serviceHaystack(s) {
  return [s.name, s.service_name, s.description, s.sku, s.category, s.item_type].filter(Boolean).join(" ");
}

function invoiceHaystack(inv) {
  return [inv.invoice_number, inv.client_name, inv.title, inv.reference].filter(Boolean).join(" ");
}

function ResultRow({ icon: Icon, title, subtitle, onSelect }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground truncate">{title}</span>
        {subtitle ? <span className="block text-xs text-muted-foreground truncate">{subtitle}</span> : null}
      </span>
    </button>
  );
}

function QuickSearchResults({
  q,
  grouped,
  servicesLoading,
  onPick,
  compact,
}) {
  const term = q.trim();
  if (!term) {
    return (
      <div className={cn("px-3 py-6 text-center", compact && "py-4")}>
        <p className="text-sm text-muted-foreground">
          Search clients, products &amp; services, and invoices in your account.
        </p>
        {!compact && (
          <p className="mt-3 text-xs text-muted-foreground/80">
            Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>{" "}
            or <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+K</kbd>{" "}
            from anywhere.
          </p>
        )}
      </div>
    );
  }

  const empty =
    grouped.clients.length === 0 && grouped.services.length === 0 && grouped.invoices.length === 0;

  if (empty && servicesLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading catalog…
      </div>
    );
  }

  if (empty) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for &ldquo;{term}&rdquo;.</p>;
  }

  return (
    <div className="max-h-[min(60vh,22rem)] overflow-y-auto py-1">
      {grouped.clients.length > 0 && (
        <div className="px-2 pb-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Clients</p>
          {grouped.clients.map((c) => (
            <ResultRow
              key={c.id}
              icon={Users}
              title={c.name || c.client_name || c.full_name || c.company || c.email || "Client"}
              subtitle={[c.email, c.company || c.company_name].filter(Boolean).join(" · ") || undefined}
              onSelect={() => onPick(`${createPageUrl("ClientDetail")}?id=${encodeURIComponent(c.id)}`)}
            />
          ))}
        </div>
      )}
      {grouped.services.length > 0 && (
        <div className="px-2 pb-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Products &amp; services
          </p>
          {grouped.services.map((s) => (
            <ResultRow
              key={s.id}
              icon={Package}
              title={s.name || "Item"}
              subtitle={[s.item_type, s.category].filter(Boolean).join(" · ") || undefined}
              onSelect={() => onPick(`${createPageUrl("Services")}?q=${encodeURIComponent(term)}`)}
            />
          ))}
        </div>
      )}
      {grouped.invoices.length > 0 && (
        <div className="px-2 pb-2">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</p>
          {grouped.invoices.map((inv) => (
            <ResultRow
              key={inv.id}
              icon={FileText}
              title={inv.invoice_number ? `Invoice ${inv.invoice_number}` : "Invoice"}
              subtitle={inv.client_name || inv.title || undefined}
              onSelect={() => onPick(`${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(inv.id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function useQuickSearchData(open) {
  const { user } = useAuth();
  const clients = useAppStore((s) => s.clients);
  const invoices = useAppStore((s) => s.invoices);
  const enabled = Boolean(user?.id) && open;
  const { data: services = [], isFetching: servicesLoading } = useServicesCatalogQuery({ enabled });

  const buildGrouped = useCallback(
    (q) => {
      const term = q.trim();
      if (!term) return { clients: [], services: [], invoices: [] };
      const cl = (clients || []).filter((c) => matches(clientHaystack(c), term)).slice(0, MAX_PER_GROUP);
      const sv = (services || []).filter((s) => matches(serviceHaystack(s), term)).slice(0, MAX_PER_GROUP);
      const inv = (invoices || []).filter((i) => matches(invoiceHaystack(i), term)).slice(0, MAX_PER_GROUP);
      return { clients: cl, services: sv, invoices: inv };
    },
    [clients, services, invoices]
  );

  return { buildGrouped, servicesLoading };
}

/**
 * Desktop header: anchored popover + optional global open via {@link OPEN_EVENT} (Ctrl/Cmd+K from Layout).
 */
export function AppQuickSearchDesktop() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const { buildGrouped, servicesLoading } = useQuickSearchData(open);

  const grouped = useMemo(() => buildGrouped(q), [buildGrouped, q]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const onPick = useCallback(
    (path) => {
      setOpen(false);
      setQ("");
      navigate(path);
    },
    [navigate]
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative max-w-md flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Clients, products & services, invoices…"
            className="h-10 rounded-xl border-border bg-muted/50 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label="Quick search"
            autoComplete="off"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="z-[200] w-[min(calc(100vw-2rem),28rem)] max-w-xl border-border bg-card p-0 shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <QuickSearchResults q={q} grouped={grouped} servicesLoading={servicesLoading} onPick={onPick} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mobile header: opens full quick search dialog.
 */
export function AppQuickSearchMobileDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const { buildGrouped, servicesLoading } = useQuickSearchData(open);

  const grouped = useMemo(() => buildGrouped(q), [buildGrouped, q]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ("");
    }
  }, [open]);

  const onPick = useCallback(
    (path) => {
      onOpenChange(false);
      setQ("");
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Quick search</DialogTitle>
          <DialogDescription>Find clients, catalog items, and invoices.</DialogDescription>
        </DialogHeader>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Clients, products & services, invoices…"
              className="h-11 rounded-xl border-border bg-muted/50 pl-10"
              aria-label="Quick search"
              autoComplete="off"
            />
          </div>
        </div>
        <QuickSearchResults
          q={q}
          grouped={grouped}
          servicesLoading={servicesLoading}
          onPick={onPick}
          compact
        />
      </DialogContent>
    </Dialog>
  );
}

export { OPEN_EVENT };
