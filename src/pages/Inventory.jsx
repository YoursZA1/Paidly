import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Barcode, Package, Plus, Search, ShoppingCart, Truck } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/AuthContext";
import { Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useAppStore } from "@/stores/useAppStore";

import StatsCard from "../components/inventory/StatsCard";
import ProductTable from "../components/inventory/ProductTable";
import ProductFormDialog from "../components/inventory/ProductFormDialog";
import SellStockDialog from "../components/inventory/SellStockDialog";
import DeliveryFormDialog from "../components/inventory/DeliveryFormDialog";
import DeliveryTable from "../components/inventory/DeliveryTable";
import RecentActivity from "../components/inventory/RecentActivity";
import LowStockAlert from "../components/inventory/LowStockAlert";
import BarcodeScannerDialog from "../components/inventory/BarcodeScannerDialog";

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const DELIVERY_ADDRESS_MARKER = "DELIVERY_ADDRESS:\n";

function packDeliveryNotes(notes, deliveryAddress) {
  const n = String(notes || "").trim();
  const addr = String(deliveryAddress || "").trim();
  if (!addr) return n || null;
  if (!n) return `${DELIVERY_ADDRESS_MARKER}${addr}`.trim() || null;
  return `${DELIVERY_ADDRESS_MARKER}${addr}\n\n---\n\n${n}`.trim() || null;
}

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const userProfile = useAppStore((s) => s.userProfile);
  const userCurrency = userProfile?.currency || "ZAR";

  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [pendingBarcode, setPendingBarcode] = useState(null);

  const [search, setSearch] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [sellDialogOpen, setSellDialogOpen] = useState(false);

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [reorderingIds, setReorderingIds] = useState([]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState("sell"); // 'sell' | 'receive'
  const [scannerQty, setScannerQty] = useState(1);

  // Funnel both camera + keyboard-wedge scans through one state transition.
  // Must be defined before the desktop keydown `useEffect` that calls it.
  const applyWedgeScan = useCallback((code) => {
    const c = String(code || "").trim();
    if (!c) return;
    setPendingBarcode(c);
  }, []);

  // Desktop: support USB/Bluetooth scanners that type quickly + press Enter.
  useEffect(() => {
    let buffer = "";
    let lastAt = 0;
    const RESET_MS = 60;
    const MIN_LEN = 4;

    const isTypingIntoField = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };

    const onKeyDown = (e) => {
      if (!user?.id) return;
      if (isTypingIntoField()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - lastAt > RESET_MS) buffer = "";
      lastAt = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_LEN) {
          applyWedgeScan(buffer);
        }
        buffer = "";
        return;
      }

      // Only accept printable chars for barcodes
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyWedgeScan, user?.id]);

  const findProductByBarcode = useCallback(
    (barcode) => {
      const code = String(barcode || "").trim();
      if (!code) return null;
      return products.find((p) => String(p.sku || "").trim() === code) || null;
    },
    [products]
  );

  const getOrgIdForCurrentUser = useCallback(async () => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("Inventory: failed to resolve org_id", error);
      return null;
    }
    return data?.org_id ?? null;
  }, [user?.id]);

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("services")
      .select(
        `
          id,
          org_id,
          name,
          description,
          sku,
          category,
          item_type,
          type,
          default_unit,
          min_quantity,
          stock_quantity,
          low_stock_threshold,
          price,
          cost_price,
          is_active,
          created_at,
          updated_at
        `.replace(/\s+/g, " ")
      )
      .eq("item_type", "product")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    // Adapt Supabase `services` product rows to the UI Product shape.
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      sku: s.sku || "",
      category: s.category || "",
      // UI expects inventory semantics:
      count_style: s.default_unit || s.unit || "units",
      units_per_count: 1,
      stock_on_hand: Number(s.stock_quantity ?? 0) || 0,
      reorder_level: Number(s.low_stock_threshold ?? 10) || 10,
      price: Number(s.price ?? 0) || 0,
      // keep original fields around (handy for debugging / forward compatibility)
      _raw: s,
    }));
  }, []);

  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("id, product_id, quantity, type, source, reference_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    // Adapt `inventory_movements` to the UI StockTransaction shape.
    return rows.map((m) => {
      const inferred =
        m.type === "in" ? "received" :
          m.type === "out" ? "sold" :
            "adjusted";
      return {
        id: m.id,
        product_id: m.product_id,
        type: inferred,
        quantity: Number(m.quantity ?? 0) || 0,
        notes: m.source || "",
        date: m.created_at ? String(m.created_at).slice(0, 10) : null,
        created_date: m.created_at || new Date().toISOString(),
      };
    });
  }, []);

  const loadDeliveries = useCallback(async () => {
    const { data, error } = await supabase
      .from("deliveries")
      .select(
        "id, product_id, quantity, status, supplier, expected_date, tracking_number, notes, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      // Deliveries table may not exist yet (depending on whether migrations have been applied).
      // Keep the rest of the inventory page functional.
      console.warn("Inventory: deliveries not available yet", error);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    return rows.map((d) => ({
      id: d.id,
      product_id: d.product_id,
      quantity: Number(d.quantity ?? 0) || 0,
      status: d.status || "pending",
      supplier: d.supplier || "",
      expected_date: d.expected_date || "",
      tracking_number: d.tracking_number || "",
      notes: d.notes || "",
      created_date: d.created_at || new Date().toISOString(),
      updated_date: d.updated_at || null,
    }));
  }, []);

  const refetchAll = useCallback(async () => {
    const [p, t, d] = await Promise.allSettled([loadProducts(), loadTransactions(), loadDeliveries()]);
    if (p.status === "fulfilled") setProducts(p.value);
    if (t.status === "fulfilled") setTransactions(t.value);
    if (d.status === "fulfilled") setDeliveries(d.value);
  }, [loadDeliveries, loadProducts, loadTransactions]);

  useEffect(() => {
    if (!user?.id) return;
    refetchAll().catch((e) => {
      console.error("Inventory: initial load failed", e);
      toast({
        title: "✗ Inventory Load Failed",
        description: "Failed to load inventory data. Please refresh and try again.",
        variant: "destructive",
      });
    });
  }, [refetchAll, toast, user?.id]);

  const handleReceive = useCallback(
    async ({ product_id, quantity, notes }) => {
      const product = products.find((p) => p.id === product_id);
      const qty = toInt(quantity);
      if (!product || qty <= 0) {
        toast({
          title: "✗ Invalid Quantity",
          description: "Please enter a valid quantity.",
          variant: "destructive",
        });
        return;
      }

      try {
        // Read current stock from DB to avoid drift
        const { data: row, error: getErr } = await supabase
          .from("services")
          .select("stock_quantity")
          .eq("id", product_id)
          .maybeSingle();
        if (getErr) throw getErr;
        const current = Number(row?.stock_quantity ?? 0) || 0;
        const nextStock = current + qty;

        const { error: updErr } = await supabase
          .from("services")
          .update({ stock_quantity: nextStock })
          .eq("id", product_id);
        if (updErr) throw updErr;

        // History
        await supabase.from("inventory_movements").insert({
          product_id,
          quantity: qty,
          type: "in",
          source: notes || "barcode_receive",
          reference_id: null,
          created_at: new Date().toISOString(),
        });

        toast({
          title: "✓ Stock Received",
          description: `Added ${qty} ${product.count_style}.`,
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: receive failed", e);
        toast({
          title: "✗ Receive Failed",
          description: "Failed to receive stock. Please try again.",
          variant: "destructive",
        });
      }
    },
    [products, refetchAll, toast]
  );

  // Sell handler (stock out)
  const handleSell = useCallback(
    async ({ product_id, quantity }) => {
      const product = products.find((p) => p.id === product_id);
      const qty = toInt(quantity);
      if (!product || qty <= 0) {
        toast({
          title: "✗ Invalid Quantity",
          description: "Please enter a valid quantity.",
          variant: "destructive",
        });
        return;
      }
      const stock = Number(product.stock_on_hand ?? 0);
      if (stock < qty) {
        toast({
          title: "✗ Not Enough Stock",
          description: `Available stock is ${stock}.`,
          variant: "destructive",
        });
        return;
      }

      try {
        // Best-effort: ensure the product satisfies trigger semantics (`services.type='product'`).
        await supabase.from("services").update({ type: "product" }).eq("id", product_id);

        const nextStock = stock - qty;
        const { error: updErr } = await supabase
          .from("services")
          .update({ stock_quantity: nextStock })
          .eq("id", product_id);
        if (updErr) throw updErr;

        const { error: insErr } = await supabase.from("inventory_movements").insert({
          product_id,
          quantity: qty,
          type: "out",
          source: "manual_sale",
          reference_id: null,
          created_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;

        toast({
          title: "✓ Sale Recorded",
          description: `Sold ${qty} ${product.count_style}.`,
          variant: "success",
        });
        setSellDialogOpen(false);
        await refetchAll();
      } catch (e) {
        console.error("Inventory: sell failed", e);
        toast({
          title: "✗ Sale Failed",
          description: "Failed to record sale. Please try again.",
          variant: "destructive",
        });
      }
    },
    [products, refetchAll, toast]
  );

  const handleBarcode = useCallback(
    async (barcode) => {
      const code = String(barcode || "").trim();
      if (!code) return;

      const product = findProductByBarcode(code);
      if (!product) {
        toast({
          title: "✗ Product Not Found",
          description: `No product matches barcode/SKU "${code}".`,
          variant: "destructive",
        });
        return;
      }

      const qty = toInt(scannerQty) || 1;

      if (scannerMode === "receive") {
        await handleReceive({ product_id: product.id, quantity: qty, notes: `barcode:${code}` });
      } else {
        await handleSell({ product_id: product.id, quantity: qty, notes: `barcode:${code}` });
      }
    },
    [findProductByBarcode, handleReceive, handleSell, scannerMode, scannerQty, toast]
  );

  useEffect(() => {
    if (!pendingBarcode) return;
    handleBarcode(pendingBarcode);
    setPendingBarcode(null);
  }, [handleBarcode, pendingBarcode]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => (p.stock_on_hand || 0) <= (p.reorder_level || 10));
  }, [products]);

  const stats = useMemo(() => {
    const totalStock = products.reduce((sum, p) => sum + (Number(p.stock_on_hand ?? 0) || 0), 0);
    const totalSold = transactions.filter((t) => t.type === "sold").reduce((sum, t) => sum + (Number(t.quantity ?? 0) || 0), 0);
    const lowStockCount = lowStockProducts.length;
    const pendingDeliveries = deliveries.filter((d) => d.status === "pending" || d.status === "in_transit").length;
    return { totalStock, totalSold, lowStockCount, pendingDeliveries };
  }, [deliveries, lowStockProducts.length, products, transactions]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      return (
        String(p.name ?? "").toLowerCase().includes(q) ||
        String(p.sku ?? "").toLowerCase().includes(q) ||
        String(p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  // Product handlers
  const handleSaveProduct = useCallback(
    async (productData) => {
      try {
        const payload = {
          item_type: "product",
          name: (productData?.name || "").trim(),
          sku: (productData?.sku || "").trim() || null,
          category: (productData?.category || "").trim() || null,
          default_unit: productData?.count_style || "units",
          // Inventory fields (stored on services)
          stock_quantity: toInt(productData?.stock_on_hand),
          low_stock_threshold: toInt(productData?.reorder_level || 10),
          price: Number(productData?.price ?? 0) || 0,
        };

        if (editingProduct) {
          await Service.update(editingProduct.id, payload);
          toast({
            title: "✓ Product Updated",
            description: `${payload.name} was updated successfully.`,
            variant: "success",
          });
        } else {
          await Service.create(payload);
          toast({
            title: "✓ Product Added",
            description: `${payload.name} was added to your inventory.`,
            variant: "success",
          });
        }
        setProductDialogOpen(false);
        setEditingProduct(null);
        await refetchAll();
      } catch (e) {
        console.error("Inventory: save product failed", e);
        toast({
          title: "✗ Save Failed",
          description: "Failed to save product. Please try again.",
          variant: "destructive",
        });
      }
    },
    [editingProduct, refetchAll, toast]
  );

  const handleDeleteProduct = useCallback(
    async (product) => {
      if (!window.confirm(`Delete "${product.name}"?`)) return;
      try {
        await Service.delete(product.id);
        toast({
          title: "✓ Product Deleted",
          description: `"${product.name}" was deleted.`,
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: delete product failed", e);
        toast({
          title: "✗ Delete Failed",
          description: "Failed to delete product. Please try again.",
          variant: "destructive",
        });
      }
    },
    [refetchAll, toast]
  );

  // Deliveries handlers
  const handleMarkDelivered = useCallback(
    async (delivery) => {
      try {
        if (!delivery || delivery.status === "delivered" || delivery.status === "cancelled") return;

        const qty = toInt(delivery.quantity);
        if (qty <= 0) {
          toast({
            title: "✗ Invalid Quantity",
            description: "Delivery quantity must be greater than 0.",
            variant: "destructive",
          });
          return;
        }

        // Best-effort: ensure the product satisfies trigger semantics.
        await supabase.from("services").update({ type: "product" }).eq("id", delivery.product_id);

        // Update delivery status first.
        const { error: updDelErr } = await supabase
          .from("deliveries")
          .update({ status: "delivered", updated_at: new Date().toISOString() })
          .eq("id", delivery.id);
        if (updDelErr) throw updDelErr;

        // Then apply stock + insert movement history.
        const { data: productRow, error: prodErr } = await supabase
          .from("services")
          .select("stock_quantity")
          .eq("id", delivery.product_id)
          .maybeSingle();
        if (prodErr) throw prodErr;

        const stock = Number(productRow?.stock_quantity ?? 0);
        const nextStock = stock + qty;
        const { error: updProdErr } = await supabase
          .from("services")
          .update({ stock_quantity: nextStock })
          .eq("id", delivery.product_id);
        if (updProdErr) throw updProdErr;

        const { error: insErr } = await supabase.from("inventory_movements").insert({
          product_id: delivery.product_id,
          quantity: qty,
          type: "in",
          source: "delivery",
          reference_id: delivery.id,
          created_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;

        toast({
          title: "✓ Delivery Received",
          description: "Stock was updated successfully.",
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: mark delivered failed", e);
        toast({
          title: "✗ Update Failed",
          description: "Failed to mark delivery as received. Please try again.",
          variant: "destructive",
        });
      }
    },
    [refetchAll, toast]
  );

  const handleSaveDelivery = useCallback(
    async (deliveryData) => {
      try {
        if (!user?.id) return;
        const resolvedOrgId = await getOrgIdForCurrentUser();
        if (!resolvedOrgId) {
          toast({
            title: "✗ No Organization",
            description: "No organization found for this user.",
            variant: "destructive",
          });
          return;
        }

        const payload = {
          org_id: resolvedOrgId,
          product_id: deliveryData.product_id,
          quantity: toInt(deliveryData.quantity),
          status: deliveryData.status,
          supplier: deliveryData.supplier || null,
          expected_date: deliveryData.expected_date || null,
          tracking_number: deliveryData.tracking_number || null,
          notes: packDeliveryNotes(deliveryData.notes, deliveryData.delivery_address),
          created_by_id: user.id,
        };

        const shouldApplyReceive = payload.status === "delivered" && (!editingDelivery?.id || editingDelivery?.status !== "delivered");

        let insertedId = null;
        if (editingDelivery?.id) {
          const { error } = await supabase.from("deliveries").update(payload).eq("id", editingDelivery.id);
          if (error) throw error;
          toast({
            title: "✓ Delivery Updated",
            description: "Delivery was updated successfully.",
            variant: "success",
          });
        } else {
          const { data: inserted, error } = await supabase.from("deliveries").insert(payload).select().maybeSingle();
          if (error) throw error;
          insertedId = inserted?.id ?? null;
          toast({
            title: "✓ Delivery Created",
            description: "Delivery was created successfully.",
            variant: "success",
          });
        }

        if (shouldApplyReceive) {
          // Apply stock + insert movement if status is set to delivered via the dialog.
          const deliveryId = editingDelivery?.id || insertedId || deliveryData?.id;
          if (deliveryId) {
            await handleMarkDelivered({ ...payload, id: deliveryId });
          }
        }

        setDeliveryDialogOpen(false);
        setEditingDelivery(null);
        await refetchAll();
      } catch (e) {
        console.error("Inventory: save delivery failed", e);
        toast({
          title: "✗ Delivery Save Failed",
          description: "Failed to save delivery. Please try again.",
          variant: "destructive",
        });
      }
    },
    [editingDelivery, getOrgIdForCurrentUser, handleMarkDelivered, refetchAll, toast, user?.id]
  );

  const handleDeleteDelivery = useCallback(
    async (delivery) => {
      if (!window.confirm("Delete this delivery?")) return;
      try {
        await supabase.from("deliveries").delete().eq("id", delivery.id);
        toast({
          title: "✓ Delivery Deleted",
          description: "Delivery was deleted successfully.",
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: delete delivery failed", e);
        toast({
          title: "✗ Delete Failed",
          description: "Failed to delete delivery. Please try again.",
          variant: "destructive",
        });
      }
    },
    [refetchAll, toast]
  );

  const handleReorder = useCallback(
    (product, suggestedQty) => {
      const stock = Number(product.stock_on_hand ?? 0);
      const threshold = Number(product.reorder_level ?? 10);
      const suggested = Number.isFinite(Number(suggestedQty)) ? toInt(suggestedQty) : Math.max(1, threshold - stock);
      const expected = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

      setReorderingIds((ids) => [...ids, product.id]);
      setEditingDelivery({
        product_id: product.id,
        quantity: suggested,
        status: "pending",
        supplier: "",
        expected_date: expected,
        tracking_number: "",
        notes: `Auto-generated reorder — stock was at ${stock} (reorder level: ${threshold})`,
      });
      setDeliveryDialogOpen(true);
      // We'll clear reorderingIds once the dialog saves.
      // (Clearing it immediately would defeat the "disable while creating" UX.)
    },
    []
  );

  const clearReorderingIdForProduct = useCallback((productIdToClear) => {
    if (!productIdToClear) return;
    setReorderingIds((ids) => ids.filter((id) => id !== productIdToClear));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary text-primary-foreground">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventory</h1>
                <p className="text-sm text-muted-foreground">{products.length} products tracked</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setScannerMode("receive");
                  setScannerQty(1);
                  setScannerOpen(true);
                }}
                className="gap-2"
                title="Scan barcode to receive stock"
              >
                <Barcode className="w-4 h-4" />
                Scan Receive
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setScannerMode("sell");
                  setScannerQty(1);
                  setScannerOpen(true);
                }}
                className="gap-2"
                title="Scan barcode to record a sale"
              >
                <Barcode className="w-4 h-4" />
                Scan Sale
              </Button>
              <Button variant="outline" onClick={() => setSellDialogOpen(true)} className="gap-2">
                Record Sale
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingDelivery(null);
                  setDeliveryDialogOpen(true);
                }}
                className="gap-2"
              >
                New Delivery
              </Button>
              <Button
                onClick={() => {
                  setEditingProduct(null);
                  setProductDialogOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" /> Add Product
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Stock On Hand"
            value={stats.totalStock.toLocaleString()}
            subtitle={`Across ${products.length} products`}
            icon={Package}
            color="primary"
          />
          <StatsCard
            title="Total Sold"
            value={stats.totalSold.toLocaleString()}
            subtitle="All time"
            icon={ShoppingCart}
            color="accent"
          />
          <StatsCard
            title="Low Stock"
            value={stats.lowStockCount}
            subtitle="Products need restock"
            icon={AlertTriangle}
            color="red"
          />
          <StatsCard
            title="Pending Deliveries"
            value={stats.pendingDeliveries}
            subtitle="In transit or pending"
            icon={Truck}
            color="blue"
          />
        </div>

        <LowStockAlert lowStockProducts={lowStockProducts} reorderingIds={reorderingIds} onReorder={handleReorder} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs defaultValue="products" className="w-full">
              <TabsList className="w-full sm:w-auto bg-muted/60">
                <TabsTrigger value="products" className="gap-1.5">
                  Products
                </TabsTrigger>
                <TabsTrigger value="deliveries" className="gap-1.5">
                  Deliveries
                </TabsTrigger>
                <TabsTrigger value="stock" className="gap-1.5">
                  Stock History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="products" className="mt-4">
                <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
                  <div className="p-4 border-b border-border/40">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products by name, SKU, or category..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <ProductTable
                    products={filteredProducts}
                    currencyCode={userCurrency}
                    onEdit={(p) => {
                      setEditingProduct(p);
                      setProductDialogOpen(true);
                    }}
                    onDelete={handleDeleteProduct}
                  />
                </div>
              </TabsContent>

              <TabsContent value="deliveries" className="mt-4">
                <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
                  <DeliveryTable
                    deliveries={deliveries}
                    products={products}
                    onEdit={(d) => {
                      setEditingDelivery(d);
                      setDeliveryDialogOpen(true);
                    }}
                    onDelete={handleDeleteDelivery}
                    onMarkDelivered={handleMarkDelivered}
                  />
                </div>
              </TabsContent>

              <TabsContent value="stock" className="mt-4">
                <div className="bg-card rounded-2xl border border-border/60 overflow-hidden p-4">
                  <div className="text-sm text-muted-foreground mb-3">
                    Recent stock movements (manual sales, deliveries, invoice adjustments).
                  </div>
                  <RecentActivity transactions={transactions} products={products} />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="bg-card rounded-2xl border border-border/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <h2 className="font-semibold text-foreground">Recent Activity</h2>
            </div>
            <RecentActivity transactions={transactions} products={products} />
          </div>
        </div>
      </main>

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) setEditingProduct(null);
        }}
        product={editingProduct}
        onSave={handleSaveProduct}
      />

      <SellStockDialog
        open={sellDialogOpen}
        onOpenChange={setSellDialogOpen}
        products={products}
        onSell={handleSell}
      />

      <DeliveryFormDialog
        open={deliveryDialogOpen}
        onOpenChange={(open) => {
          setDeliveryDialogOpen(open);
          if (!open) {
            clearReorderingIdForProduct(editingDelivery?.product_id);
            setEditingDelivery(null);
          }
        }}
        delivery={editingDelivery}
        products={products}
        onSave={async (data) => {
          await handleSaveDelivery(data);
          clearReorderingIdForProduct(data?.product_id);
        }}
      />

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title={scannerMode === "receive" ? "Scan to Receive Stock" : "Scan to Record Sale"}
        onDetected={(code) => {
          handleBarcode(code);
        }}
      />
    </div>
  );
}

