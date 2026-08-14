import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Client, Invoice } from "@/api/entities";
import { Button } from "@/components/ui/button";
import {
  UserPlusIcon,
  PlusIcon,
  EnvelopeIcon,
  PhoneIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { formatCurrency } from "../components/CurrencySelector";
import ConfirmationDialog from "../components/shared/ConfirmationDialog";
import { createPageUrl } from "@/utils";
import { useClientsQuery } from "@/hooks/useClientsQuery";
import { useAppStore } from "@/stores/useAppStore";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO, isValid } from "date-fns";

const statusStyles = {
  draft: "bg-status-draft/15 text-slate-600 dark:text-slate-300 border border-status-draft/25 dark:border-status-draft/35",
  sent: "bg-status-sent/12 text-status-sent border border-status-sent/25",
  viewed: "bg-status-sent/10 text-status-sent border border-status-sent/20",
  partial_paid: "bg-status-pending/12 text-status-pending border border-status-pending/25",
  paid: "bg-status-paid/12 text-status-paid border border-status-paid/25",
  overdue: "bg-status-overdue/12 text-status-overdue border border-status-overdue/25",
};

function safeFormatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
  } catch {
    return "N/A";
  }
}

/** Compute outstanding for a list of invoices (same logic as ClientDetail). */
function totalOutstandingForInvoices(invoices) {
  return invoices
    .filter((inv) =>
      ["sent", "viewed", "partial_paid", "overdue"].includes(inv.status)
    )
    .reduce((sum, inv) => {
      if (inv.status === "partial_paid" && inv.payments?.length > 0) {
        const totalPaid = inv.payments.reduce((s, p) => s + (p.amount || 0), 0);
        return sum + (inv.total_amount || 0) - totalPaid;
      }
      return sum + (inv.total_amount || 0);
    }, 0);
}

/** Build a map of client_id -> outstanding balance from all invoices. */
function clientOutstandingMap(invoices) {
  const byClient = {};
  (invoices || []).forEach((inv) => {
    const cid = inv.client_id;
    if (!cid) return;
    if (!byClient[cid]) byClient[cid] = [];
    byClient[cid].push(inv);
  });
  const out = {};
  Object.keys(byClient).forEach((cid) => {
    out[cid] = totalOutstandingForInvoices(byClient[cid]);
  });
  return out;
}

/** Mobile swipe-to-bill card: drag right to reveal orange "Bill" action; >100px triggers create invoice. */
function QuickBillCard({ client, balance, userCurrency, onSelectClient, onCreateInvoice }) {
  const x = useMotionValue(0);
  const iconOpacity = useTransform(x, [0, 100], [0, 1]);
  const iconScale = useTransform(x, [0, 100], [0.5, 1.2]);
  const triggeredBillRef = React.useRef(false);

  const handleDragEnd = (_, info) => {
    if (info.offset.x > 100) {
      triggeredBillRef.current = true;
      onCreateInvoice(client);
    }
    animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
  };

  const handleTap = () => {
    if (triggeredBillRef.current) {
      triggeredBillRef.current = false;
      return;
    }
    onSelectClient(client);
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-orange-500">
      <motion.div
        style={{ opacity: iconOpacity, scale: iconScale }}
        className="absolute inset-y-0 left-0 w-20 flex items-center justify-center text-white pointer-events-none"
        aria-hidden
      >
        <PlusIcon className="w-6 h-6 stroke-[3]" />
      </motion.div>
      <motion.button
        type="button"
        drag="x"
        dragConstraints={{ left: 0, right: 120 }}
        dragElastic={0.1}
        style={{ x }}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        className="relative w-full cursor-grab active:cursor-grabbing text-left bg-card p-5 rounded-[28px] border border-border flex justify-between items-center active:scale-[0.97] transition-transform shadow-sm min-w-0"
        whileTap={{ scale: 1 }}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">{client.name}</span>
          <span className="text-[11px] text-muted-foreground truncate">{client.email || client.company || "—"}</span>
        </div>
        <div className="text-right ml-4 shrink-0">
          <p className={`font-medium text-xs tabular-nums ${balance > 0 ? "text-orange-500" : "text-emerald-500"}`}>
            {formatCurrency(balance, userCurrency)}
          </p>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            {balance > 0 ? "Overdue" : "Settled"}
          </span>
        </div>
      </motion.button>
    </div>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const clientsFromStore = useAppStore((s) => s.clients);
  const invoicesFromStore = useAppStore((s) => s.invoices);
  const userProfileFromStore = useAppStore((s) => s.userProfile);

  const lastLoadErrorToastRef = useRef(0);
  const {
    clients,
    invoices,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
    fetchNextClientsPage,
    hasNextClientsPage,
    isFetchingNextClientsPage,
    fetchNextInvoicesPage,
    hasNextInvoicesPage,
    isFetchingNextInvoicesPage,
  } = useClientsQuery({
    user: authUser,
    clientsBootstrap: clientsFromStore ?? [],
    invoicesBootstrap: invoicesFromStore ?? [],
  });
  const user = userProfileFromStore ?? authUser ?? null;
  /** Only block the UI when the query failed and we have no rows from cache or store. */
  const loadError =
    isError && clients.length === 0 && invoices.length === 0
      ? error?.message || "Unable to load clients"
      : null;
  /** Soft warning when refetch failed but cached rows still show */
  const showRefreshStaleWarning = isError && (clients.length > 0 || invoices.length > 0);
  const showLoadingSkeleton = isLoading && clients.length === 0;

  const [searchTerm, setSearchTerm] = useState("");
  const [activeClient, setActiveClient] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingClient, setDeletingClient] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailTab, setDetailTab] = useState("invoices");

  const clientsLoadMoreMobileRef = useRef(null);
  const clientsLoadMoreDesktopRef = useRef(null);
  const invoicesLoadMoreRef = useRef(null);

  useEffect(() => {
    if (!hasNextClientsPage) return undefined;
    const els = [clientsLoadMoreMobileRef.current, clientsLoadMoreDesktopRef.current].filter(Boolean);
    if (els.length === 0) return undefined;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextClientsPage();
      },
      { root: null, rootMargin: "240px", threshold: 0 }
    );
    els.forEach((el) => ob.observe(el));
    return () => ob.disconnect();
  }, [hasNextClientsPage, fetchNextClientsPage]);

  useEffect(() => {
    const el = invoicesLoadMoreRef.current;
    if (!el || !hasNextInvoicesPage) return undefined;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextInvoicesPage();
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasNextInvoicesPage, fetchNextInvoicesPage, activeClient?.id]);

  const outstandingByClient = useMemo(
    () => clientOutstandingMap(invoices),
    [invoices]
  );

  const searchFilteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.contact_person?.toLowerCase().includes(term) ||
        c.company?.toLowerCase?.().includes(term)
    );
  }, [clients, searchTerm]);

  const loadData = useCallback(
    (showRefreshingState) => {
      refetch().then(({ data: next }) => {
        if (showRefreshingState && activeClient && next?.clients?.length > 0) {
          const updated = next.clients.find((c) => c.id === activeClient.id);
          if (updated) setActiveClient(updated);
        } else if (!activeClient && next?.clients?.length > 0) {
          setActiveClient(next.clients[0]);
        }
      });
    },
    [refetch, activeClient]
  );

  useEffect(() => {
    if (!loadError || lastLoadErrorToastRef.current > Date.now() - 4000) return;
    lastLoadErrorToastRef.current = Date.now();
    const msg = error?.message || "";
    toast({
      title: "Could not load clients",
      description: msg.includes("timed out")
        ? "The server took too long to respond. Use Try again below or refresh the page."
        : msg || "Something went wrong. Use Try again below or refresh the page.",
      variant: "destructive",
      action: (
        <ToastAction onClick={() => refetch()} aria-label="Retry loading clients">
          Try again
        </ToastAction>
      ),
    });
  }, [loadError, error?.message, toast, refetch]);

  useEffect(() => {
    if (searchFilteredClients.length > 0 && !activeClient) {
      setActiveClient(searchFilteredClients[0]);
    }
    if (
      activeClient &&
      !searchFilteredClients.find((c) => c.id === activeClient.id)
    ) {
      setActiveClient(searchFilteredClients[0] || null);
    }
  }, [searchFilteredClients, activeClient]);


  const goEditClient = (c) => {
    navigate(`${createPageUrl("EditClient")}?id=${encodeURIComponent(c.id)}`);
  };

  const handleDeleteRequest = (client) => {
    setDeletingClient(client);
    setShowDeleteConfirm(true);
  };

  const handleDeleteClient = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      const relatedInvoices = await Invoice.filter({
        client_id: deletingClient.id,
      });
      if (relatedInvoices?.length > 0) {
        toast({
          title: "Cannot delete client",
          description:
            "This client has invoices. Archive or delete their invoices first.",
          variant: "destructive",
        });
        return;
      }
      await Client.delete(deletingClient.id);
      toast({
        title: "Client Deleted",
        description: "Client has been permanently deleted.",
        variant: "default",
      });
      setShowDeleteConfirm(false);
      const deletedId = deletingClient.id;
      setDeletingClient(null);
      const { data: next } = await refetch();
      const nextClients = next?.clients ?? [];
      if (activeClient?.id === deletedId) {
        setActiveClient(nextClients[0] || null);
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({
        title: "Error",
        description: "Failed to delete client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const userCurrency = user?.currency || "ZAR";

  const activeInvoices = useMemo(() => {
    if (!activeClient?.id) return [];
    return (invoices || []).filter((inv) => inv.client_id === activeClient.id);
  }, [activeClient?.id, invoices]);

  const activeStats = useMemo(() => {
    const totalRevenue = activeInvoices.reduce(
      (s, inv) => s + (inv.total_amount || 0),
      0
    );
    const outstanding = totalOutstandingForInvoices(activeInvoices);
    const paidInvoices = activeInvoices.filter((i) => i.status === "paid");
    const avgPaymentDays =
      paidInvoices.length > 0
        ? Math.round(
            paidInvoices.reduce((sum, inv) => {
              const paidAt =
                inv.payments?.[0]?.paid_at ||
                inv.updated_at ||
                inv.created_date;
              const created = inv.created_date ? new Date(inv.created_date) : null;
              const paid = paidAt ? new Date(paidAt) : null;
              if (!created || !paid) return sum;
              return sum + Math.round((paid - created) / (24 * 60 * 60 * 1000));
            }, 0) / paidInvoices.length
          )
        : null;
    return {
      totalRevenue,
      outstanding,
      avgPaymentDays: avgPaymentDays != null ? `${avgPaymentDays} days` : "—",
    };
  }, [activeInvoices]);

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100dvh-4rem)] lg:min-h-0 min-h-0 w-full min-w-0 overflow-x-hidden bg-slate-50/50 dark:bg-slate-900/50">
      {/* Mobile: single scroll with Layout main (no nested viewport height) */}
      <div className="lg:hidden flex flex-col w-full min-w-0">
        <div className="flex flex-col w-full px-4 pt-2 sm:pt-4 space-y-3 pb-4">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-xl font-semibold text-foreground tracking-tight font-display">Clients</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={isRefetching || showLoadingSkeleton}
                className="p-2 bg-muted rounded-xl active:scale-95 transition-all disabled:opacity-50 text-muted-foreground"
                aria-label="Refresh clients"
              >
                <ArrowPathIcon
                  className={`w-5 h-5 text-muted-foreground ${isRefetching ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => navigate(createPageUrl("EditClient"))}
                className="p-2 bg-primary rounded-xl active:scale-95 shadow-lg shadow-primary/20 transition-all text-primary-foreground"
                aria-label="Add client"
                data-testid="clients-add"
              >
                <UserPlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted border-none rounded-2xl px-5 py-4 text-base text-foreground focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50 outline-none min-w-0"
            style={{ fontSize: "16px" }}
            data-testid="clients-search"
          />

          <div className="space-y-3 overflow-x-hidden pb-2">
            {loadError && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex-1 min-w-0">
                  Could not refresh clients. Showing cached data. {loadError}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="shrink-0 gap-1">
                  <ArrowPathIcon className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
                  Try again
                </Button>
              </div>
            )}
            {showLoadingSkeleton ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-[28px] bg-slate-100 dark:bg-slate-700 animate-pulse"
                  />
                ))}
              </div>
            ) : searchFilteredClients.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {searchTerm ? "No clients match your search." : "No clients yet. Add one to get started."}
              </div>
            ) : (
              <>
                {searchFilteredClients.map((client) => {
                  const balance = outstandingByClient[client.id] ?? 0;
                  return (
                    <QuickBillCard
                      key={client.id}
                      client={client}
                      balance={balance}
                      userCurrency={userCurrency}
                      onSelectClient={setActiveClient}
                      onCreateInvoice={(c) => navigate(createPageUrl("CreateInvoice") + "?client_id=" + encodeURIComponent(c.id))}
                    />
                  );
                })}
                {(hasNextClientsPage || isFetchingNextClientsPage) && (
                  <div
                    ref={clientsLoadMoreMobileRef}
                    className="flex min-h-[48px] flex-col items-center justify-center py-3 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {isFetchingNextClientsPage
                      ? "Loading more clients…"
                      : "Scroll to load more clients"}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop: sidebar list (≥ 1024px) */}
      <aside className="hidden lg:flex w-72 sm:w-80 md:w-96 shrink-0 bg-card border-r border-border flex-col min-h-0 min-w-0">
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-semibold text-foreground tracking-tight font-display">Clients</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={isRefetching || showLoadingSkeleton}
                className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="Refresh clients"
                title="Refresh"
              >
                <ArrowPathIcon
                  className={`w-5 h-5 ${isRefetching ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => navigate(createPageUrl("EditClient"))}
                className="p-2 bg-primary rounded-xl text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
                aria-label="Add client"
                data-testid="clients-add"
              >
                <UserPlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <input
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted border-none rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-ring/20 outline-none min-w-0 placeholder:text-muted-foreground/50"
            data-testid="clients-search"
          />
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 min-h-0">
          {showRefreshStaleWarning && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-amber-800 dark:text-amber-200 flex-1 min-w-0 truncate">
                Could not refresh. Showing cached data.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="shrink-0 h-8 text-xs gap-1">
                <ArrowPathIcon className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          )}
          {showLoadingSkeleton ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-[24px] bg-slate-100 dark:bg-slate-700 animate-pulse"
                />
              ))}
            </div>
          ) : searchFilteredClients.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {searchTerm ? "No clients match your search." : "No clients yet. Add one to get started."}
            </div>
          ) : (
            <>
              {searchFilteredClients.map((client) => {
                const balance = outstandingByClient[client.id] ?? 0;
                const status = balance > 0 ? "Overdue" : "Settled";
                const isActive = activeClient?.id === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setActiveClient(client)}
                    data-testid="client-list-item"
                    data-client-name={client.name}
                    className={`w-full flex justify-between items-center px-3.5 py-3 rounded-2xl transition-all text-left min-w-0 active:scale-[0.97] ${
                      isActive
                        ? "bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-100 dark:ring-orange-800"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {client.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {client.company || client.email || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p
                        className={`text-xs font-medium tabular-nums ${
                          balance > 0 ? "text-red-500" : "text-emerald-500"
                        }`}
                      >
                        {formatCurrency(balance, userCurrency)}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        {status}
                      </p>
                    </div>
                  </button>
                );
              })}
              {(hasNextClientsPage || isFetchingNextClientsPage) && (
                <div
                  ref={clientsLoadMoreDesktopRef}
                  className="flex min-h-[44px] flex-col items-center justify-center py-2 text-[11px] text-muted-foreground"
                  aria-live="polite"
                >
                  {isFetchingNextClientsPage
                    ? "Loading more clients…"
                    : "Scroll to load more clients"}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* 2. CLIENT DETAIL VIEW */}
      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto min-h-0 p-4 lg:p-6">
        {!activeClient ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            {loadError && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3 mb-6 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md w-full text-center sm:text-left">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
                  {clients.length > 0 ? "Showing cached data. Refresh failed." : "Could not load clients. Try again or refresh the page."}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="shrink-0 gap-1">
                  <ArrowPathIcon className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
                  Try again
                </Button>
              </div>
            )}
            <p className="text-sm font-medium">
              {showLoadingSkeleton ? "Loading…" : "Select a client"}
            </p>
            <p className="text-xs mt-1">
              {!showLoadingSkeleton && clients.length === 0
                ? "Add a client to see their details here."
                : "Choose a client from the list to view details and invoices."}
            </p>
          </div>
        ) : (
          <>
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
              <div className="min-w-0 flex-1">
                <h2
                  className="text-xl md:text-2xl font-semibold text-foreground tracking-tight mb-1.5 font-display"
                  data-testid="client-active-name"
                >
                  {activeClient.name}
                </h2>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <EnvelopeIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{activeClient.email}</span>
                  </span>
                  {activeClient.phone && (
                    <span className="flex items-center gap-1.5">
                      <PhoneIcon className="w-3.5 h-3.5 shrink-0" />
                      {activeClient.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link
                  to={createPageUrl("ClientDetail") + "?id=" + encodeURIComponent(activeClient.id)}
                  className="inline-flex"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-medium border-border hover:bg-muted"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 mr-1.5" />
                    Full profile
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-medium border-border hover:bg-muted"
                  onClick={() => goEditClient(activeClient)}
                  data-testid="client-edit"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5 mr-1.5" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-medium border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-700 dark:hover:text-red-300"
                  onClick={() => handleDeleteRequest(activeClient)}
                  data-testid="client-delete"
                >
                  <TrashIcon className="w-3.5 h-3.5 mr-1.5" />
                  Delete
                </Button>
                <Link
                  to={
                    createPageUrl("CreateInvoice") +
                    "?client_id=" +
                    encodeURIComponent(activeClient.id)
                  }
                >
                  <Button size="sm" className="px-4 bg-primary hover:bg-primary/90 rounded-xl text-xs font-medium text-primary-foreground shadow-sm shadow-primary/20">
                    Bill Client
                  </Button>
                </Link>
              </div>
            </header>

            {hasNextInvoicesPage && (
              <p className="text-xs text-muted-foreground mb-4 max-w-2xl">
                Balances use invoices loaded so far. Scroll down on this page to load older invoices for fuller totals.
              </p>
            )}

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                {
                  label: "Total Revenue",
                  value: formatCurrency(activeStats.totalRevenue, userCurrency),
                  color: "text-foreground",
                },
                {
                  label: "Outstanding",
                  value: formatCurrency(activeStats.outstanding, userCurrency),
                  color: "text-red-500",
                },
                {
                  label: "Avg. Payment",
                  value: activeStats.avgPaymentDays,
                  color: "text-emerald-500",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-card px-5 py-4 rounded-2xl border border-border shadow-sm"
                >
                  <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-0.5">
                    {stat.label}
                  </p>
                  <p className={`text-lg font-semibold tabular-nums ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabbed Content: Invoices */}
            <section className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex gap-6">
                <button
                  type="button"
                  onClick={() => setDetailTab("invoices")}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    detailTab === "invoices"
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  Invoices
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("quotations")}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    detailTab === "quotations"
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  Quotations
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("statement")}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    detailTab === "statement"
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  Statement
                </button>
              </div>

              <div className="p-6">
                {detailTab === "invoices" && (
                  <>
                    {activeInvoices.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground">
                        <p className="text-sm font-medium">No invoices yet</p>
                        <p className="text-xs mt-1 mb-4">
                          Create an invoice for this client to see it here.
                        </p>
                        <Link
                          to={
                            createPageUrl("CreateInvoice") +
                            "?client_id=" +
                            encodeURIComponent(activeClient.id)
                          }
                        >
                          <Button>
                            Bill Client
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider border-b border-border">
                            <th className="pb-3">Invoice #</th>
                            <th className="pb-3">Date</th>
                            <th className="pb-3 text-right">Amount</th>
                            <th className="pb-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm text-muted-foreground">
                          {activeInvoices.slice(0, 20).map((inv) => (
                            <tr
                              key={inv.id}
                              className="border-b border-border hover:bg-muted/50"
                            >
                              <td className="py-3">
                                <Link
                                  to={
                                    createPageUrl("ViewInvoice") + "?id=" + inv.id
                                  }
                                  className="text-foreground font-medium hover:text-primary"
                                >
                                  {inv.invoice_number || inv.id?.slice(0, 8)}
                                </Link>
                              </td>
                              <td className="py-3 text-xs">
                                {safeFormatDate(inv.issue_date || inv.created_date)}
                              </td>
                              <td className="py-3 text-right text-sm font-medium tabular-nums text-foreground">
                                {formatCurrency(inv.total_amount, userCurrency)}
                              </td>
                              <td className="py-3 text-right">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                                    statusStyles[inv.status] || statusStyles.draft
                                  }`}
                                >
                                  {inv.status?.replace("_", " ") || "Draft"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
                {detailTab === "quotations" && (
                  <div className="py-10 text-center text-muted-foreground">
                    <p className="text-sm font-medium">Quotations</p>
                    <p className="text-xs mt-1">
                      Link to quotes for this client can be added here.
                    </p>
                    <Link to={createPageUrl("Quotes")}>
                      <Button variant="outline" className="mt-4">
                        View all quotes
                      </Button>
                    </Link>
                  </div>
                )}
                {detailTab === "statement" && (
                  <div className="py-10 text-center text-muted-foreground">
                    <p className="text-sm font-medium">Statement</p>
                    <p className="text-xs mt-1">
                      Account statement view can be added here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {(hasNextInvoicesPage || isFetchingNextInvoicesPage) && (
              <div
                ref={invoicesLoadMoreRef}
                className="mt-8 flex min-h-[52px] flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 py-4 text-center"
                aria-live="polite"
              >
                {isFetchingNextInvoicesPage ? (
                  <span className="text-sm text-muted-foreground">
                    Loading more invoices…
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    More invoices on file — scroll this area to load older rows for balances and lists.
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeletingClient(null);
        }}
        onConfirm={handleDeleteClient}
        title={`Delete ${deletingClient?.name || "Client"}?`}
        description="This action cannot be undone. This will permanently delete the client."
        confirmText="Delete"
        isConfirming={isDeleting}
      />
    </div>
  );
}
