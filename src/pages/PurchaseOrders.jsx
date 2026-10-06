import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, Mail, Phone, Pencil, Trash2 } from "lucide-react";

import { Supplier, Service } from "@/api/entities";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardGridSkeleton } from "@/components/shared/PageSkeleton";
import { formatCurrency } from "@/components/CurrencySelector";
import { resolveIssuerBrand } from "@/lib/documentIssuerBrand";
import { invalidateRevenueReadModels } from "@/lib/queryInvalidation";
import {
  PO_STATUS,
  purchaseOrderFinancials,
  summarizePurchaseOrders,
} from "@shared/procurement/purchaseOrderMath.js";

import PurchaseOrderTable from "@/components/purchaseOrders/PurchaseOrderTable";
import PurchaseOrderSummary from "@/components/purchaseOrders/PurchaseOrderSummary";
import PurchaseOrderFormDialog from "@/components/purchaseOrders/PurchaseOrderFormDialog";
import PurchaseOrderPreviewDialog from "@/components/purchaseOrders/PurchaseOrderPreviewDialog";
import ReceivePurchaseOrderDialog from "@/components/purchaseOrders/ReceivePurchaseOrderDialog";
import RecordSupplierPaymentDialog from "@/components/purchaseOrders/RecordSupplierPaymentDialog";
import SupplierFormDialog from "@/components/purchaseOrders/SupplierFormDialog";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  fetchPurchaseOrder,
  fetchPurchaseOrderHeaders,
  fetchPurchaseOrderItems,
  receivePurchaseOrderItem,
  recordPurchaseOrderPayment,
  returnPurchaseOrderToDraft,
  revisePurchaseOrder,
  savePurchaseOrderDraft,
  submitPurchaseOrderForApproval,
} from "@/services/PurchaseOrderService";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts", match: (po) => po.status === PO_STATUS.DRAFT },
  { value: "approval", label: "Awaiting approval", match: (po) => po.status === PO_STATUS.PENDING_APPROVAL },
  {
    value: "delivery",
    label: "Awaiting delivery",
    match: (po) => purchaseOrderFinancials(po).awaitingDelivery > 0,
  },
  { value: "owed", label: "Outstanding", match: (po) => purchaseOrderFinancials(po).owed > 0 },
  { value: "overdue", label: "Overdue", match: (po) => purchaseOrderFinancials(po).isOverdue },
  {
    value: "closed",
    label: "Closed",
    match: (po) => {
      const f = purchaseOrderFinancials(po);
      return po.status === PO_STATUS.CANCELLED || (po.status === PO_STATUS.RECEIVED && f.owed <= 0);
    },
  },
];

export default function PurchaseOrdersPage() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  // Lines are loaded per order when it is opened (an org-wide line list would hit PostgREST's row cap).
  const [itemsByPo, setItemsByPo] = useState(() => new Map());
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [isSavingPo, setIsSavingPo] = useState(false);

  const [previewId, setPreviewId] = useState(null);
  const [receiveId, setReceiveId] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [payId, setPayId] = useState(null);

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const business = useMemo(() => resolveIssuerBrand({ profile }), [profile]);
  const currency = business?.currency || profile?.currency || "ZAR";

  const loadAll = useCallback(async () => {
    try {
      const [poRows, supplierRows, serviceRows] = await Promise.all([
        fetchPurchaseOrderHeaders(),
        Supplier.list("-name"),
        Service.list(),
      ]);
      setPurchaseOrders(poRows);
      setSuppliers(supplierRows);
      setProducts(serviceRows.filter((row) => row.item_type === "product"));
    } catch (error) {
      console.error("PurchaseOrders: load failed", error);
      toast({ title: "✗ Load Failed", description: "Could not load purchase orders.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Deep link from an expense: /PurchaseOrders?po=<id>
  useEffect(() => {
    const id = searchParams.get("po");
    if (id && !isLoading && purchaseOrders.some((po) => po.id === id)) {
      setPreviewId(id);
      searchParams.delete("po");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isLoading, purchaseOrders]);

  /** Replace one PO row with a fresh one from the database (totals/status set by triggers). */
  const upsertPo = useCallback((row) => {
    if (!row?.id) return;
    setPurchaseOrders((prev) => {
      const exists = prev.some((po) => po.id === row.id);
      return exists ? prev.map((po) => (po.id === row.id ? { ...po, ...row } : po)) : [row, ...prev];
    });
  }, []);

  const suppliersById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  /** Load (or reload) one order's lines into the cache. */
  const loadItems = useCallback(async (purchaseOrderId) => {
    if (!purchaseOrderId) return [];
    try {
      const rows = await fetchPurchaseOrderItems(purchaseOrderId);
      setItemsByPo((prev) => new Map(prev).set(purchaseOrderId, rows));
      return rows;
    } catch (error) {
      console.error("PurchaseOrders: load lines failed", error);
      toast({ title: "✗ Could not load order lines", description: error?.message || "Please try again.", variant: "destructive" });
      return null;
    }
  }, [toast]);

  // Whichever order is open (preview, edit, receive) gets its lines; edits must never start from an empty list.
  useEffect(() => {
    for (const id of [previewId, editId, receiveId]) {
      if (id && !itemsByPo.has(id)) loadItems(id);
    }
  }, [previewId, editId, receiveId, itemsByPo, loadItems]);

  const summary = useMemo(() => summarizePurchaseOrders(purchaseOrders), [purchaseOrders]);
  // Per-supplier money in one pass (open POs, outstanding, payable now, paid, due in 30 days).
  const supplierStats = useMemo(() => {
    const bySupplier = new Map();
    for (const po of purchaseOrders) {
      if (!po.supplier_id) continue;
      const list = bySupplier.get(po.supplier_id) || [];
      list.push(po);
      bySupplier.set(po.supplier_id, list);
    }
    const stats = new Map();
    bySupplier.forEach((list, supplierId) => stats.set(supplierId, summarizePurchaseOrders(list)));
    return stats;
  }, [purchaseOrders]);
  const visibleOrders = useMemo(() => {
    const active = FILTERS.find((f) => f.value === filter);
    return active?.match ? purchaseOrders.filter(active.match) : purchaseOrders;
  }, [purchaseOrders, filter]);

  const byId = (id) => purchaseOrders.find((po) => po.id === id) || null;
  const previewPo = byId(previewId);
  const editPo = byId(editId);
  const receivePo = byId(receiveId);
  const payPo = byId(payId);
  const money = (v, po) => formatCurrency(v, po?.currency || currency);

  const fail = (title, error) => {
    console.error(`PurchaseOrders: ${title}`, error);
    toast({ title: `✗ ${title}`, description: error?.message || "Please try again.", variant: "destructive" });
  };

  /** Create or save a draft; `submit` also sends it for approval. Returns the stored row. */
  const handleSavePo = async (payload, { submit = false } = {}) => {
    setIsSavingPo(true);
    try {
      let po = await savePurchaseOrderDraft(payload);
      if (submit) po = await submitPurchaseOrderForApproval(po.id);
      await Promise.all([loadAll(), loadItems(po.id)]);
      if (payload.id && !submit) toast({ title: `✓ ${po.po_number} saved`, variant: "success" });
      return po;
    } catch (error) {
      fail(payload.id ? "Save Failed" : "Create Failed", error);
      return null;
    } finally {
      setIsSavingPo(false);
    }
  };

  const handleSubmit = async (po) => {
    try {
      const submitted = await submitPurchaseOrderForApproval(po.id);
      upsertPo(submitted);
      toast({ title: `✓ ${po.po_number} submitted for approval`, description: "Lines and terms are now locked.", variant: "success" });
      return submitted;
    } catch (error) {
      fail("Submit Failed", error);
      return null;
    }
  };

  const handleReturnToDraft = async (po) => {
    const reason = window.prompt(`Return ${po.po_number} to draft?\n\nReason (kept in the order history):`, "");
    if (reason === null) return;
    try {
      upsertPo(await returnPurchaseOrderToDraft(po.id, reason));
      toast({ title: `✓ ${po.po_number} returned to draft`, description: "You can edit it again.", variant: "success" });
    } catch (error) {
      fail("Return Failed", error);
    }
  };

  const handleRevise = async (po) => {
    if (
      !window.confirm(
        `Revise ${po.po_number}?\n\nThe approved order is cancelled and kept on record, and a new draft is created with the same lines for you to change and resubmit.`
      )
    ) {
      return;
    }
    try {
      const draft = await revisePurchaseOrder(po);
      await loadAll();
      toast({ title: `✓ ${po.po_number} revised as ${draft.po_number}`, description: "Edit the new draft, then submit it for approval.", variant: "success" });
      setPreviewId(null);
      setEditId(draft.id);
    } catch (error) {
      fail("Revise Failed", error);
    }
  };

  const handleApprove = async (po) => {
    try {
      const approved = await approvePurchaseOrder(po.id);
      upsertPo(approved);
      toast({
        title: `✓ ${po.po_number} approved`,
        description: `${money(approved.total_amount, approved)} committed${approved.due_date ? `, due ${approved.due_date}` : ""}. It becomes an expense when you pay the supplier.`,
        variant: "success",
      });
      return approved;
    } catch (error) {
      fail("Approve Failed", error);
      return null;
    }
  };

  const handleCancel = async (po) => {
    const f = purchaseOrderFinancials(po);
    const detail =
      f.received > 0
        ? `\n\nGoods already received (${money(f.received, po)}) stay owed to the supplier; the remaining ${money(f.awaitingDelivery, po)} is released.`
        : po.status === PO_STATUS.DRAFT || po.status === PO_STATUS.PENDING_APPROVAL
          ? ""
          : `\n\nThis releases the ${money(f.committed, po)} commitment.`;
    if (!window.confirm(`Cancel purchase order ${po.po_number}?${detail}`)) return;
    try {
      upsertPo(await cancelPurchaseOrder(po.id));
      toast({ title: `✓ ${po.po_number} cancelled`, variant: "success" });
    } catch (error) {
      console.error("PurchaseOrders: cancel failed", error);
      toast({ title: "✗ Cancel Failed", description: error?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleReceiveLines = async (lines) => {
    const po = receivePo;
    if (!po || lines.length === 0) return;
    setIsReceiving(true);
    let received = 0;
    try {
      for (const line of lines) {
        await receivePurchaseOrderItem(line.id, line.quantity, line.unit_cost);
        received += 1;
      }
    } catch (error) {
      console.error("PurchaseOrders: receive failed", error);
      toast({
        title: "✗ Receive Failed",
        description: `${received > 0 ? `${received} line(s) were received before this error. ` : ""}${error?.message || "Please try again."}`,
        variant: "destructive",
      });
    } finally {
      await Promise.all([loadAll(), loadItems(po.id)]);
      setIsReceiving(false);
    }
    if (received === 0) return;

    const fresh = await fetchPurchaseOrder(po.id).catch(() => null);
    if (fresh) upsertPo(fresh);
    const f = purchaseOrderFinancials(fresh || po);
    const supplierName = suppliersById.get(po.supplier_id)?.name;
    if (fresh?.status === PO_STATUS.RECEIVED) {
      setReceiveId(null);
      toast({
        title: `✓ ${po.po_number} fully received`,
        description: f.owed > 0 ? `${money(f.owed, po)} now owed${supplierName ? ` to ${supplierName}` : ""}.` : "Paid in full.",
        variant: "success",
      });
    } else {
      toast({
        title: "✓ Goods received",
        description: `${money(f.received, po)} received so far · ${money(f.awaitingDelivery, po)} still to come.`,
        variant: "success",
      });
    }
  };

  const handleRecordPayment = async (po, payment) => {
    const result = await recordPurchaseOrderPayment(po, payment);
    upsertPo(result.purchaseOrder);
    invalidateRevenueReadModels(queryClient);
    return result;
  };

  const handleSaveSupplier = async (data) => {
    setIsSavingSupplier(true);
    try {
      if (editingSupplier) {
        await Supplier.update(editingSupplier.id, data);
      } else {
        await Supplier.create(data);
      }
      toast({ title: "✓ Supplier Saved", variant: "success" });
      setSupplierDialogOpen(false);
      setEditingSupplier(null);
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: save supplier failed", error);
      toast({ title: "✗ Save Failed", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    try {
      await Supplier.delete(supplier.id);
      toast({ title: "✓ Supplier Deleted", variant: "success" });
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: delete supplier failed", error);
      toast({ title: "✗ Delete Failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const openPreview = (po) => {
    setPoDialogOpen(false);
    setEditId(null);
    setPayId(null);
    if (po?.id) {
      upsertPo(po);
      setPreviewId(po.id);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 page-header-sticky">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">Purchase Orders</h1>
            <p className="text-muted-foreground">
              What you&apos;ve committed to spend, what&apos;s arrived, what you&apos;ve paid, and what you still owe.
            </p>
          </div>
          <Button onClick={() => setPoDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            New Purchase Order
          </Button>
        </div>

        {isLoading ? <CardGridSkeleton count={6} /> : <PurchaseOrderSummary summary={summary} currency={currency} />}

        <Tabs defaultValue="orders">
          <TabsList className="mb-4">
            <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter purchase orders">
                  {FILTERS.map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.value}
                      size="sm"
                      variant={filter === f.value ? "default" : "outline"}
                      className="rounded-full h-8"
                      onClick={() => setFilter(f.value)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
                {isLoading ? (
                  <CardGridSkeleton count={4} />
                ) : (
                  <PurchaseOrderTable
                    purchaseOrders={visibleOrders}
                    suppliersById={suppliersById}
                    onView={(po) => setPreviewId(po.id)}
                    onEdit={(po) => setEditId(po.id)}
                    onSubmit={handleSubmit}
                    onApprove={handleApprove}
                    onReceive={(po) => setReceiveId(po.id)}
                    onPay={(po) => setPayId(po.id)}
                    onCancel={handleCancel}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Suppliers</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingSupplier(null); setSupplierDialogOpen(true); }}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Supplier
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <CardGridSkeleton count={4} />
                ) : suppliers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Building2 className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2 font-display">No suppliers yet</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                      Add a supplier before creating your first purchase order.
                    </p>
                    <Button onClick={() => { setEditingSupplier(null); setSupplierDialogOpen(true); }}>
                      <Plus className="w-4 h-4 mr-2" /> Add Supplier
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {suppliers.map((supplier) => {
                      const stats = supplierStats.get(supplier.id);
                      return (
                        <div key={supplier.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 shrink-0 rounded bg-primary/15 flex items-center justify-center text-primary font-bold">
                                {supplier.name.charAt(0).toUpperCase()}
                              </div>
                              <h3 className="font-semibold truncate">{supplier.name}</h3>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => { setEditingSupplier(supplier); setSupplierDialogOpen(true); }}
                                aria-label={`Edit ${supplier.name}`}
                              >
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteSupplier(supplier)}
                                aria-label={`Delete ${supplier.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm text-muted-foreground mt-3">
                            {supplier.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-3 h-3" /> {supplier.email}
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3 h-3" /> {supplier.phone}
                              </div>
                            )}
                            {supplier.payment_terms && (
                              <div className="text-xs">Terms: {supplier.payment_terms}</div>
                            )}
                          </div>
                          {stats && (
                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
                              <div>
                                <dt className="text-muted-foreground">Open POs</dt>
                                <dd className="font-medium tabular-nums">{stats.openCount}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Outstanding</dt>
                                <dd className={`font-medium tabular-nums ${stats.owed > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                                  {formatCurrency(stats.owed, currency)}
                                </dd>
                                {stats.payableNow > 0 && (
                                  <dd className="text-muted-foreground">{formatCurrency(stats.payableNow, currency)} payable now</dd>
                                )}
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Paid to supplier</dt>
                                <dd className="font-medium tabular-nums">{formatCurrency(stats.paid, currency)}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Due in 30 days</dt>
                                <dd className={`font-medium tabular-nums ${stats.overdue > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                                  {formatCurrency(stats.dueNext30, currency)}
                                </dd>
                                {stats.overdue > 0 && (
                                  <dd className="text-red-600 dark:text-red-400">{formatCurrency(stats.overdue, currency)} overdue</dd>
                                )}
                              </div>
                            </dl>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PurchaseOrderFormDialog
        open={poDialogOpen || Boolean(editPo && itemsByPo.has(editPo.id))}
        onOpenChange={(next) => {
          if (!next) {
            setPoDialogOpen(false);
            setEditId(null);
          }
        }}
        purchaseOrder={editPo}
        items={editPo ? itemsByPo.get(editPo.id) || [] : []}
        suppliers={suppliers}
        products={products}
        currency={currency}
        defaultDeliveryAddress={business?.address || ""}
        onSave={handleSavePo}
        onApproveSaved={handleApprove}
        onPreviewSaved={openPreview}
        isSaving={isSavingPo}
      />

      <PurchaseOrderPreviewDialog
        open={Boolean(previewPo && itemsByPo.has(previewPo.id))}
        onOpenChange={(next) => { if (!next) setPreviewId(null); }}
        purchaseOrder={previewPo}
        items={previewPo ? itemsByPo.get(previewPo.id) || [] : []}
        supplier={previewPo ? suppliersById.get(previewPo.supplier_id) || null : null}
        business={business}
        productsById={productsById}
        revisionOf={previewPo?.revises_purchase_order_id ? byId(previewPo.revises_purchase_order_id) : null}
        revisedAs={previewPo ? purchaseOrders.find((po) => po.revises_purchase_order_id === previewPo.id) || null : null}
        onOpenPurchaseOrder={setPreviewId}
        onEdit={(po) => { setPreviewId(null); setEditId(po.id); }}
        onSubmit={handleSubmit}
        onReturnToDraft={handleReturnToDraft}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onReceive={(po) => setReceiveId(po.id)}
        onPay={(po) => setPayId(po.id)}
        onCancel={handleCancel}
        onSent={upsertPo}
      />

      <ReceivePurchaseOrderDialog
        open={Boolean(receivePo)}
        onOpenChange={(next) => { if (!next) setReceiveId(null); }}
        purchaseOrder={receivePo}
        items={receivePo ? itemsByPo.get(receivePo.id) || [] : []}
        productsById={productsById}
        onReceiveLines={handleReceiveLines}
        isSaving={isReceiving}
      />

      <RecordSupplierPaymentDialog
        open={Boolean(payPo)}
        onOpenChange={(next) => { if (!next) setPayId(null); }}
        purchaseOrder={payPo}
        supplier={payPo ? suppliersById.get(payPo.supplier_id) || null : null}
        onRecord={handleRecordPayment}
        onPreview={openPreview}
      />

      <SupplierFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        supplier={editingSupplier}
        onSave={handleSaveSupplier}
        isSaving={isSavingSupplier}
      />
    </div>
  );
}
