import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Barcode, Package, Plus, Search, ShoppingCart, Truck } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useAppStore } from "@/stores/useAppStore";
import { normalizeInventoryRows } from "@/utils/inventoryNormalization";
import { alertSupabaseWriteFailure, checkSupabaseWriteResult } from "@/utils/supabaseErrorUtils";

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
const COUNT_STYLE_TO_DB_UNIT = {
  units: "unit",
  cases: "case",
  packs: "pack",
  boxes: "box",
  pallets: "pallet",
  bottles: "bottle",
  bags: "bag",
  rolls: "roll",
};
const VALID_DB_DEFAULT_UNITS = new Set(Object.values(COUNT_STYLE_TO_DB_UNIT));

function packDeliveryNotes(notes, deliveryAddress) {
  const n = String(notes || "").trim();
  const addr = String(deliveryAddress || "").trim();
  if (!addr) return n || null;
  if (!n) return `${DELIVERY_ADDRESS_MARKER}${addr}`.trim() || null;
  return `${DELIVERY_ADDRESS_MARKER}${addr}\n\n---\n\n${n}`.trim() || null;
}

function toDbDefaultUnit(countStyle, fallback) {
  const primary = String(countStyle || "").trim().toLowerCase();
  if (VALID_DB_DEFAULT_UNITS.has(primary)) return primary;
  if (COUNT_STYLE_TO_DB_UNIT[primary]) return COUNT_STYLE_TO_DB_UNIT[primary];

  const secondary = String(fallback || "").trim().toLowerCase();
  if (VALID_DB_DEFAULT_UNITS.has(secondary)) return secondary;

  return "unit";
}

function getReadableDeliveryError(error) {
  const raw = String(error?.message || error?.details || error?.hint || "").trim();
  const msg = raw.toLowerCase();
  if (!raw) return "Failed to save delivery. Please try again.";
  if (msg.includes("violates row-level security") || msg.includes("permission denied")) {
    return "You do not have permission to save this delivery. Sign in again or check org access.";
  }
  if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "Selected product is not valid for deliveries. Pick a catalog product and apply the latest database migration if this persists.";
  }
  if (msg.includes("invalid input syntax") && msg.includes("uuid")) {
    return "Invalid product reference. Refresh the page and select the product again.";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

function getReadableSaveError(error) {
  const raw = String(error?.message || error?.details || error?.hint || "").trim();
  const msg = raw.toLowerCase();
  if (!raw) return "Failed to save product. Please try again.";
  if (msg.includes("duplicate key") || msg.includes("already exists")) {
    return "A product with this SKU already exists. Please use a different SKU.";
  }
  if (msg.includes("violates row-level security") || msg.includes("permission denied")) {
    return "You do not have permission to update this product.";
  }
  if (msg.includes("default_unit") || msg.includes("check constraint")) {
    return "Invalid count style for this product. Please select a supported count style.";
  }
  if (msg.includes("invalid input syntax")) {
    return "One or more fields have invalid values. Please review and try again.";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

function getReadableSaleError(error) {
  const raw = String(error?.message || error?.details || error?.hint || "").trim();
  const msg = raw.toLowerCase();
  if (!raw) return "Failed to record sale. Please try again.";
  if (msg.includes("no organization found")) {
    return "Could not resolve your organization. Sign out and sign in again.";
  }
  if (msg.includes("violates row-level security") || msg.includes("permission denied")) {
    return "You do not have permission to update stock for this product.";
  }
  if (msg.includes("must reference a product-type service")) {
    return "This item is not marked as a product in catalog. Update it to product type and try again.";
  }
  if (msg.includes("not enough stock") || msg.includes("negative stock")) {
    return "Not enough stock available to record this sale.";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

/** Prefer catalog row org (multi-org safe); else membership org from Supabase auth uid. */
function resolveInventoryProductOrgId(product, membershipOrgId) {
  const fromRaw = product?._raw?.org_id ?? product?.org_id;
  return fromRaw ?? membershipOrgId ?? null;
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
    const { data: sessionData } = await supabase.auth.getSession();
    const authUid = sessionData?.session?.user?.id;
    if (!authUid) return null;
    const { data, error } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", authUid)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Inventory: failed to resolve org_id", error);
      return null;
    }
    return data?.org_id ?? null;
  }, []);

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

    // Centralized normalization policy for product rows.
    return normalizeInventoryRows("products", rows);
  }, []);

  const loadTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("id, product_id, quantity, type, source, reference_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    // Centralized normalization policy for transaction rows.
    return normalizeInventoryRows("transactions", rows);
  }, []);

  const loadDeliveries = useCallback(async () => {
    // Schema (Paidly migration): created_date / updated_date — not created_at / updated_at.
    const { data, error } = await supabase
      .from("deliveries")
      .select(
        "id, product_id, quantity, status, supplier, expected_date, tracking_number, notes, created_date, updated_date"
      )
      .order("created_date", { ascending: false })
      .limit(200);

    if (error) {
      // Table missing, RLS, or column mismatch — keep inventory usable without deliveries.
      console.warn("Inventory: deliveries load skipped", error?.message || error);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    // Centralized normalization policy for delivery rows.
    return normalizeInventoryRows("deliveries", rows);
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
        const membershipOrgId = await getOrgIdForCurrentUser();
        const resolvedOrgId = resolveInventoryProductOrgId(product, membershipOrgId);
        if (!resolvedOrgId) {
          throw new Error("No organization found for this user.");
        }

        const { data: row, error: getErr } = await supabase
          .from("services")
          .select("stock_quantity")
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId)
          .maybeSingle();
        if (getErr) throw getErr;
        const current = Number(row?.stock_quantity ?? 0) || 0;
        const nextStock = current + qty;

        const { error: updErr } = await supabase
          .from("services")
          .update({ stock_quantity: nextStock })
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId);
        if (updErr) throw updErr;

        const { error: movErr } = await supabase.from("inventory_movements").insert({
          product_id,
          quantity: qty,
          type: "in",
          source: notes || "barcode_receive",
          reference_id: null,
          created_at: new Date().toISOString(),
        });
        if (!checkSupabaseWriteResult({ error: movErr }, "Record stock movement (receive)")) return;

        toast({
          title: "✓ Stock Received",
          description: `Added ${qty} ${product.count_style}.`,
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: receive failed", e);
        alertSupabaseWriteFailure(e, "Receive stock");
        toast({
          title: "✗ Receive Failed",
          description: getReadableSaleError(e),
          variant: "destructive",
        });
      }
    },
    [getOrgIdForCurrentUser, products, refetchAll, toast]
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
        const membershipOrgId = await getOrgIdForCurrentUser();
        const resolvedOrgId = resolveInventoryProductOrgId(product, membershipOrgId);
        if (!resolvedOrgId) {
          throw new Error("No organization found for this user.");
        }

        const { data: currentRow, error: getErr } = await supabase
          .from("services")
          .select("id, stock_quantity, type")
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId)
          .maybeSingle();
        if (getErr) throw getErr;
        if (!currentRow?.id) {
          throw new Error("Product not found in your organization.");
        }

        // Best-effort: ensure the product satisfies trigger semantics (`services.type='product'`).
        const { error: typeErr } = await supabase
          .from("services")
          .update({ type: "product" })
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId);
        if (typeErr) throw typeErr;

        const dbStock = Number(currentRow.stock_quantity ?? 0) || 0;
        if (dbStock < qty) {
          throw new Error(`Not enough stock. Available stock is ${dbStock}.`);
        }
        const nextStock = dbStock - qty;
        const { error: updErr } = await supabase
          .from("services")
          .update({ stock_quantity: nextStock })
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId);
        if (updErr) throw updErr;

        const { error: insErr } = await supabase.from("inventory_movements").insert({
          product_id,
          quantity: qty,
          type: "out",
          source: "manual_sale",
          reference_id: null,
          created_at: new Date().toISOString(),
        });
        if (!checkSupabaseWriteResult({ error: insErr }, "Record stock movement (sale)")) return;

        toast({
          title: "✓ Sale Recorded",
          description: `Sold ${qty} ${product.count_style}.`,
          variant: "success",
        });
        setSellDialogOpen(false);
        await refetchAll();
      } catch (e) {
        console.error("Inventory: sell failed", e);
        alertSupabaseWriteFailure(e, "Record sale");
        toast({
          title: "✗ Sale Failed",
          description: getReadableSaleError(e),
          variant: "destructive",
        });
      }
    },
    [getOrgIdForCurrentUser, products, refetchAll, toast]
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
        if (!user?.id) return;
        const membershipOrgId = await getOrgIdForCurrentUser();
        const resolvedOrgId = editingProduct
          ? resolveInventoryProductOrgId(editingProduct, membershipOrgId)
          : membershipOrgId;
        if (!resolvedOrgId) {
          toast({
            title: "✗ No Organization",
            description: "No organization found for this user.",
            variant: "destructive",
          });
          return;
        }

        const name = String(productData?.name || "").trim();
        if (!name) {
          toast({
            title: "✗ Missing Name",
            description: "Product name is required.",
            variant: "destructive",
          });
          return;
        }

        const payload = {
          org_id: resolvedOrgId,
          item_type: "product",
          type: "product",
          name,
          sku: (productData?.sku || "").trim() || null,
          category: (productData?.category || "").trim() || null,
          default_unit: toDbDefaultUnit(productData?.count_style, editingProduct?._raw?.default_unit),
          // Inventory fields (stored on services)
          stock_quantity: toInt(productData?.stock_on_hand),
          low_stock_threshold: toInt(productData?.reorder_level || 10),
          price: Number(productData?.price ?? 0) || 0,
          default_rate: Number(productData?.price ?? 0) || 0,
        };

        if (editingProduct) {
          const { data: updatedRow, error } = await supabase
            .from("services")
            .update(payload)
            .eq("id", editingProduct.id)
            .eq("org_id", resolvedOrgId)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!updatedRow?.id) {
            const { data: fallbackRow, error: fallbackError } = await supabase
              .from("services")
              .update(payload)
              .eq("id", editingProduct.id)
              .select("id")
              .maybeSingle();
            if (fallbackError) throw fallbackError;
            if (!fallbackRow?.id) {
              throw new Error("No matching product row was updated.");
            }
          }
          toast({
            title: "✓ Product Updated",
            description: `${payload.name} was updated successfully.`,
            variant: "success",
          });
        } else {
          const { error } = await supabase.from("services").insert(payload);
          if (!checkSupabaseWriteResult({ error }, "Add inventory product")) return;
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
        alertSupabaseWriteFailure(e, "Save inventory product");
        toast({
          title: "✗ Save Failed",
          description: getReadableSaveError(e),
          variant: "destructive",
        });
      }
    },
    [editingProduct, getOrgIdForCurrentUser, refetchAll, toast, user?.id]
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
        alertSupabaseWriteFailure(e, "Delete inventory product");
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
    async (delivery, options = {}) => {
      const alreadyMarkedDelivered = options.alreadyMarkedDelivered === true;
      try {
        if (!delivery || delivery.status === "cancelled") return;
        if (!alreadyMarkedDelivered && delivery.status === "delivered") return;

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
        const { error: typeErr } = await supabase
          .from("services")
          .update({ type: "product" })
          .eq("id", delivery.product_id);
        if (!checkSupabaseWriteResult({ error: typeErr }, "Update product type for delivery")) return;

        if (!alreadyMarkedDelivered) {
          const { error: updDelErr } = await supabase
            .from("deliveries")
            .update({ status: "delivered", updated_date: new Date().toISOString() })
            .eq("id", delivery.id);
          if (updDelErr) throw updDelErr;
        }

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
        alertSupabaseWriteFailure(e, "Mark delivery received");
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
        const { data: sessionWrap } = await supabase.auth.getSession();
        const authUid = sessionWrap?.session?.user?.id;
        if (!authUid) {
          toast({
            title: "✗ Not signed in",
            description: "Sign in again to save deliveries.",
            variant: "destructive",
          });
          return;
        }

        const now = new Date().toISOString();
        const baseFields = {
          product_id: deliveryData.product_id,
          quantity: toInt(deliveryData.quantity),
          status: deliveryData.status,
          supplier: deliveryData.supplier || null,
          expected_date: deliveryData.expected_date || null,
          tracking_number: deliveryData.tracking_number || null,
          notes: packDeliveryNotes(deliveryData.notes, deliveryData.delivery_address),
        };

        const shouldApplyReceive =
          baseFields.status === "delivered" &&
          (!editingDelivery?.id || editingDelivery?.status !== "delivered");

        let insertedId = null;
        if (editingDelivery?.id) {
          const { error } = await supabase
            .from("deliveries")
            .update({ ...baseFields, updated_date: now })
            .eq("id", editingDelivery.id);
          if (error) throw error;
          toast({
            title: "✓ Delivery Updated",
            description: "Delivery was updated successfully.",
            variant: "success",
          });
        } else {
          const newId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const insertPayload = {
            id: newId,
            ...baseFields,
            created_by_id: authUid,
            created_date: now,
            updated_date: now,
          };
          const { data: inserted, error } = await supabase
            .from("deliveries")
            .insert(insertPayload)
            .select()
            .maybeSingle();
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
            await handleMarkDelivered({ ...baseFields, id: deliveryId }, { alreadyMarkedDelivered: true });
          }
        }

        setDeliveryDialogOpen(false);
        setEditingDelivery(null);
        await refetchAll();
      } catch (e) {
        console.error("Inventory: save delivery failed", e);
        alertSupabaseWriteFailure(e, "Save delivery");
        toast({
          title: "✗ Delivery Save Failed",
          description: getReadableDeliveryError(e),
          variant: "destructive",
        });
      }
    },
    [editingDelivery, handleMarkDelivered, refetchAll, toast, user?.id]
  );

  const handleDeleteDelivery = useCallback(
    async (delivery) => {
      if (!window.confirm("Delete this delivery?")) return;
      try {
        const { error: delErr } = await supabase.from("deliveries").delete().eq("id", delivery.id);
        if (delErr) throw delErr;
        toast({
          title: "✓ Delivery Deleted",
          description: "Delivery was deleted successfully.",
          variant: "success",
        });
        await refetchAll();
      } catch (e) {
        console.error("Inventory: delete delivery failed", e);
        alertSupabaseWriteFailure(e, "Delete delivery");
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

