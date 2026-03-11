import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Client, Invoice, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import ClientForm from "../components/clients/ClientForm";
import { formatCurrency } from "../components/CurrencySelector";
import ConfirmationDialog from "../components/shared/ConfirmationDialog";
import { createPageUrl } from "@/utils";
import { format, parseISO, isValid } from "date-fns";

const statusStyles = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-primary/15 text-primary",
  viewed: "bg-purple-100 text-purple-700",
  partial_paid: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
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
        className="relative w-full cursor-grab active:cursor-grabbing text-left bg-white p-5 rounded-[28px] border border-slate-100 flex justify-between items-center active:scale-[0.97] transition-transform shadow-sm min-w-0"
        whileTap={{ scale: 1 }}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-bold text-slate-900 truncate">{client.name}</span>
          <span className="text-[11px] text-slate-400 truncate">{client.email || client.company || "—"}</span>
        </div>
        <div className="text-right ml-4 shrink-0">
          <p className={`font-black text-xs tabular-nums ${balance > 0 ? "text-orange-500" : "text-emerald-500"}`}>
            {formatCurrency(balance, userCurrency)}
          </p>
          <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
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

  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeClient, setActiveClient] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingClient, setDeletingClient] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailTab, setDetailTab] = useState("invoices");
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const loadData = async (showRefreshingState = false) => {
    if (showRefreshingState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const [clientsData, invoicesData, userData] = await Promise.all([
        Client.list("-created_date"),
        Invoice.list("-created_date"),
        User.me(),
      ]);
      setClients(clientsData || []);
      setInvoices(invoicesData || []);
      setUser(userData);
      if (showRefreshingState && activeClient && clientsData?.length > 0) {
        const updated = clientsData.find((c) => c.id === activeClient.id);
        if (updated) setActiveClient(updated);
      } else if (!activeClient && clientsData?.length > 0) {
        setActiveClient(clientsData[0]);
      }
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Could not load clients",
        description:
          error?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Intentionally run only on mount; loadData is stable for initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSaveClient = async (clientData) => {
    if (!clientData.name?.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!clientData.email?.trim()) {
      toast({
        title: "Validation Error",
        description: "Email address is required.",
        variant: "destructive",
      });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientData.email.trim())) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingClient) {
        await Client.update(editingClient.id, clientData);
        toast({
          title: "Client Updated",
          description: "Client information has been updated.",
          variant: "success",
        });
        setClients((prev) =>
          prev.map((c) => (c.id === editingClient.id ? { ...c, ...clientData } : c))
        );
        if (activeClient?.id === editingClient.id) {
          setActiveClient((prev) => (prev ? { ...prev, ...clientData } : null));
        }
      } else {
        const newClient = await Client.create(clientData);
        toast({
          title: "Client Added",
          description: `${clientData.name} has been added.`,
          variant: "success",
        });
        setClients((prev) => [newClient, ...(prev || [])]);
        setActiveClient(newClient);
      }
      setShowForm(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error saving client:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save client.",
        variant: "destructive",
      });
    }
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setShowForm(true);
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
      setDeletingClient(null);
      setClients((prev) => {
        const next = prev.filter((c) => c.id !== deletingClient.id);
        if (activeClient?.id === deletingClient.id) {
          setActiveClient(next[0] || null);
        }
        return next;
      });
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
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] bg-slate-50/50 min-h-0 w-full min-w-0 overflow-x-hidden">
      {/* Mobile: vertical card list (< 1024px) */}
      <div className="lg:hidden flex flex-col w-full min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-col w-full px-4 pt-4 space-y-3 flex-1 min-h-0 overflow-hidden">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Clients</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={isRefreshing || isLoading}
                className="p-2 bg-slate-50 rounded-xl active:scale-95 transition-all disabled:opacity-50"
                aria-label="Refresh clients"
              >
                <ArrowPathIcon
                  className={`w-5 h-5 text-slate-400 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => { setEditingClient(null); setShowForm(true); }}
                className="p-2 bg-orange-500 rounded-xl active:scale-95 shadow-lg shadow-orange-100 transition-all text-white"
                aria-label="Add client"
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
            className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-base focus:ring-2 focus:ring-orange-500/20 placeholder:text-slate-300 outline-none min-w-0"
            style={{ fontSize: "16px" }}
          />

          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 pb-24 min-h-0">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-[28px] bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : searchFilteredClients.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                {searchTerm ? "No clients match your search." : "No clients yet. Add one to get started."}
              </div>
            ) : (
              searchFilteredClients.map((client) => {
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
              })
            )}
          </div>
        </div>
      </div>

      {/* Desktop: sidebar list (≥ 1024px) */}
      <aside className="hidden lg:flex w-72 sm:w-80 md:w-96 shrink-0 bg-white border-r border-slate-200 flex-col min-h-0 min-w-0">
        <div className="p-6 border-b border-slate-100 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-black text-slate-900">Clients</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={isRefreshing || isLoading}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
                aria-label="Refresh clients"
                title="Refresh"
              >
                <ArrowPathIcon
                  className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingClient(null);
                  setShowForm(true);
                }}
                className="p-2 bg-orange-500 rounded-xl text-white shadow-lg shadow-orange-100 hover:bg-orange-600 transition-colors"
                aria-label="Add client"
              >
                <UserPlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <input
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-2xl p-3 text-base focus:ring-2 focus:ring-orange-200 outline-none min-w-0"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 min-h-0">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-[24px] bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : searchFilteredClients.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {searchTerm ? "No clients match your search." : "No clients yet. Add one to get started."}
            </div>
          ) : (
            searchFilteredClients.map((client) => {
              const balance = outstandingByClient[client.id] ?? 0;
              const status = balance > 0 ? "Overdue" : "Settled";
              const isActive = activeClient?.id === client.id;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setActiveClient(client)}
                  className={`w-full flex justify-between items-center p-4 rounded-[24px] transition-all text-left min-w-0 active:scale-[0.97] ${
                    isActive
                      ? "bg-orange-50 ring-1 ring-orange-100"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">
                      {client.name}
                    </h3>
                    <p className="text-xs text-slate-400 truncate">
                      {client.company || client.email || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p
                      className={`text-xs font-black ${
                        balance > 0 ? "text-red-500" : "text-emerald-500"
                      }`}
                    >
                      {formatCurrency(balance, userCurrency)}
                    </p>
                    <p className="text-[10px] uppercase font-bold text-slate-400">
                      {status}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. CLIENT DETAIL VIEW */}
      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto min-h-0 p-4 lg:p-6 md:p-10">
        {!activeClient ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <p className="text-lg font-medium">
              {isLoading ? "Loading…" : "Select a client"}
            </p>
            <p className="text-sm mt-1">
              {!isLoading && clients.length === 0
                ? "Add a client to see their details here."
                : "Choose a client from the list to view details and invoices."}
            </p>
          </div>
        ) : (
          <>
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-10">
              <div className="min-w-0">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 truncate">
                  {activeClient.name}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-slate-500 font-medium">
                  <span className="flex items-center gap-1 min-w-0">
                    <EnvelopeIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{activeClient.email}</span>
                  </span>
                  {activeClient.phone && (
                    <span className="flex items-center gap-1">
                      <PhoneIcon className="w-4 h-4 shrink-0" />
                      {activeClient.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <Link
                  to={createPageUrl("ClientDetail") + "?id=" + encodeURIComponent(activeClient.id)}
                  className="inline-flex"
                >
                  <Button
                    variant="outline"
                    className="rounded-2xl font-bold border-slate-200"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
                    Full profile
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="rounded-2xl font-bold border-slate-200"
                  onClick={() => handleEditClient(activeClient)}
                >
                  <PencilSquareIcon className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl font-bold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleDeleteRequest(activeClient)}
                >
                  <TrashIcon className="w-4 h-4 mr-2" />
                  Delete
                </Button>
                <Link
                  to={
                    createPageUrl("CreateInvoice") +
                    "?client_id=" +
                    encodeURIComponent(activeClient.id)
                  }
                >
                  <Button className="px-6 py-3 bg-orange-600 hover:bg-orange-700 rounded-2xl font-bold text-white shadow-lg shadow-orange-200">
                    Bill Client
                  </Button>
                </Link>
              </div>
            </header>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
              {[
                {
                  label: "Total Revenue",
                  value: formatCurrency(activeStats.totalRevenue, userCurrency),
                  color: "text-slate-900",
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
                  className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm"
                >
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    {stat.label}
                  </p>
                  <p className={`text-2xl font-black ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabbed Content: Invoices */}
            <section className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex gap-8">
                <button
                  type="button"
                  onClick={() => setDetailTab("invoices")}
                  className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                    detailTab === "invoices"
                      ? "text-orange-600 border-orange-600"
                      : "text-slate-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  Invoices
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("quotations")}
                  className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                    detailTab === "quotations"
                      ? "text-orange-600 border-orange-600"
                      : "text-slate-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  Quotations
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("statement")}
                  className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                    detailTab === "statement"
                      ? "text-orange-600 border-orange-600"
                      : "text-slate-400 border-transparent hover:text-slate-600"
                  }`}
                >
                  Statement
                </button>
              </div>

              <div className="p-8">
                {detailTab === "invoices" && (
                  <>
                    {activeInvoices.length === 0 ? (
                      <div className="py-12 text-center text-slate-500">
                        <p className="font-medium">No invoices yet</p>
                        <p className="text-sm mt-1 mb-4">
                          Create an invoice for this client to see it here.
                        </p>
                        <Link
                          to={
                            createPageUrl("CreateInvoice") +
                            "?client_id=" +
                            encodeURIComponent(activeClient.id)
                          }
                        >
                          <Button className="bg-orange-600 hover:bg-orange-700">
                            Bill Client
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50">
                            <th className="pb-4">Invoice #</th>
                            <th className="pb-4">Date</th>
                            <th className="pb-4 text-right">Amount</th>
                            <th className="pb-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-slate-600">
                          {activeInvoices.slice(0, 20).map((inv) => (
                            <tr
                              key={inv.id}
                              className="border-b border-slate-50 hover:bg-slate-50/50"
                            >
                              <td className="py-4">
                                <Link
                                  to={
                                    createPageUrl("ViewInvoice") + "?id=" + inv.id
                                  }
                                  className="text-slate-900 font-semibold hover:text-orange-600"
                                >
                                  {inv.invoice_number || inv.id?.slice(0, 8)}
                                </Link>
                              </td>
                              <td className="py-4">
                                {safeFormatDate(inv.issue_date || inv.created_date)}
                              </td>
                              <td className="py-4 text-right font-bold text-slate-900">
                                {formatCurrency(inv.total_amount, userCurrency)}
                              </td>
                              <td className="py-4 text-right">
                                <span
                                  className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase ${
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
                  <div className="py-12 text-center text-slate-500">
                    <p className="font-medium">Quotations</p>
                    <p className="text-sm mt-1">
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
                  <div className="py-12 text-center text-slate-500">
                    <p className="font-medium">Statement</p>
                    <p className="text-sm mt-1">
                      Account statement view can be added here.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Add/Edit Client Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingClient(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <ClientForm
            client={editingClient}
            onSave={handleSaveClient}
            onCancel={() => {
              setShowForm(false);
              setEditingClient(null);
            }}
          />
        </DialogContent>
      </Dialog>

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
