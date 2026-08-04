import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { PurchaseOrder, PurchaseOrderItem, Supplier, Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardGridSkeleton } from "@/components/shared/PageSkeleton";
import { Building2, Mail, Phone, Pencil, Trash2 } from "lucide-react";

import PurchaseOrderTable from "@/components/purchaseOrders/PurchaseOrderTable";
import PurchaseOrderFormDialog from "@/components/purchaseOrders/PurchaseOrderFormDialog";
import ReceivePurchaseOrderDialog from "@/components/purchaseOrders/ReceivePurchaseOrderDialog";
import SupplierFormDialog from "@/components/purchaseOrders/SupplierFormDialog";
import {
  createPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrderItem,
} from "@/services/PurchaseOrderService";

export default function PurchaseOrdersPage() {
  const { toast } = useToast();

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrderItems, setPurchaseOrderItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [isCreatingPo, setIsCreatingPo] = useState(false);

  const [receiveTarget, setReceiveTarget] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [poRows, poItemRows, supplierRows, serviceRows] = await Promise.all([
        PurchaseOrder.list("-created_date"),
        PurchaseOrderItem.list(),
        Supplier.list("-name"),
        Service.list(),
      ]);
      setPurchaseOrders(poRows);
      setPurchaseOrderItems(poItemRows);
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

  const suppliersById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const itemsByPo = useMemo(() => {
    const map = new Map();
    for (const item of purchaseOrderItems) {
      const list = map.get(item.purchase_order_id) || [];
      list.push(item);
      map.set(item.purchase_order_id, list);
    }
    return map;
  }, [purchaseOrderItems]);
  const itemCountByPo = useMemo(() => {
    const map = new Map();
    itemsByPo.forEach((items, poId) => map.set(poId, items.length));
    return map;
  }, [itemsByPo]);

  const handleCreatePo = async (payload) => {
    setIsCreatingPo(true);
    try {
      await createPurchaseOrder(payload);
      toast({ title: "✓ Purchase Order Created", variant: "success" });
      setPoDialogOpen(false);
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: create failed", error);
      toast({ title: "✗ Create Failed", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsCreatingPo(false);
    }
  };

  const handleApprove = async (po) => {
    try {
      await approvePurchaseOrder(po.id);
      toast({ title: "✓ Purchase Order Approved", variant: "success" });
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: approve failed", error);
      toast({ title: "✗ Approve Failed", description: error?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleCancel = async (po) => {
    if (!window.confirm(`Cancel purchase order ${po.po_number}?`)) return;
    try {
      await cancelPurchaseOrder(po.id);
      toast({ title: "✓ Purchase Order Cancelled", variant: "success" });
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: cancel failed", error);
      toast({ title: "✗ Cancel Failed", description: error?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleReceiveLine = async (poItemId, quantity, unitCost) => {
    setIsReceiving(true);
    try {
      await receivePurchaseOrderItem(poItemId, quantity, unitCost);
      toast({ title: "✓ Stock Received", variant: "success" });
      await loadAll();
    } catch (error) {
      console.error("PurchaseOrders: receive failed", error);
      toast({ title: "✗ Receive Failed", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsReceiving(false);
    }
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

  const receiveItems = receiveTarget ? itemsByPo.get(receiveTarget.id) || [] : [];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">Purchase Orders</h1>
            <p className="text-gray-600">Order stock from suppliers and receive it into inventory.</p>
          </div>
          <Button onClick={() => setPoDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            New Purchase Order
          </Button>
        </div>

        <Tabs defaultValue="orders">
          <TabsList className="mb-4">
            <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <CardGridSkeleton count={4} />
                ) : (
                  <PurchaseOrderTable
                    purchaseOrders={purchaseOrders}
                    suppliersById={suppliersById}
                    itemCountByPo={itemCountByPo}
                    onApprove={handleApprove}
                    onReceive={setReceiveTarget}
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
                    {suppliers.map((supplier) => (
                      <div key={supplier.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-primary/15 flex items-center justify-center text-primary font-bold">
                              {supplier.name.charAt(0).toUpperCase()}
                            </div>
                            <h3 className="font-semibold">{supplier.name}</h3>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setEditingSupplier(supplier); setSupplierDialogOpen(true); }}
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteSupplier(supplier)}
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
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <PurchaseOrderFormDialog
        open={poDialogOpen}
        onOpenChange={setPoDialogOpen}
        suppliers={suppliers}
        products={products}
        onCreate={handleCreatePo}
        isSaving={isCreatingPo}
      />

      <ReceivePurchaseOrderDialog
        open={Boolean(receiveTarget)}
        onOpenChange={(next) => { if (!next) setReceiveTarget(null); }}
        purchaseOrder={receiveTarget}
        items={receiveItems}
        productsById={productsById}
        onReceiveLine={handleReceiveLine}
        isSaving={isReceiving}
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
