import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { supabase } from "@/lib/supabaseClient";
import { resolveActiveOrgIdForUser } from "@/api/auth/orgCache.js";
import { useAuth } from "@/contexts/AuthContext";
import { Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useAppStore } from "@/stores/useAppStore";
import { normalizeCatalogRows, normalizeInventoryRows } from "@/utils/inventoryNormalization";
import { alertSupabaseWriteFailure, checkSupabaseWriteResult } from "@/utils/supabaseErrorUtils";
import { invalidateServicesCatalog } from "@/hooks/useServicesCatalogQuery";
import { servicesToCsv, parseServiceCsv, csvRowToServicePayload } from "@/utils/serviceCsvMapping";
import { catalogRowsToCsvSource } from "@/utils/catalogCsvUtils";

import ManageProductsView from "../components/inventory/ManageProductsView";
import ProductFormDialog from "../components/inventory/ProductFormDialog";
import CatalogItemDialog from "../components/inventory/CatalogItemDialog";
import SellStockDialog from "../components/inventory/SellStockDialog";
import DeliveryFormDialog from "../components/inventory/DeliveryFormDialog";
import CategoryDialog from "../components/inventory/CategoryDialog";
import InventoryToolsSheet from "../components/inventory/InventoryToolsSheet";
import BarcodeScannerDialog from "../components/inventory/BarcodeScannerDialog";
import IndustryTemplatesDialog from "../components/inventory/IndustryTemplatesDialog";
import AssetService from "@/services/AssetService";

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
    if (msg.includes("barcode")) {
      return "A product with this barcode already exists in your organization.";
    }
    return "A product with this SKU or barcode already exists. Please use different values.";
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
  if (msg.includes("insufficient stock")) {
    return "Not enough stock available to record this sale.";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

/** Prefer catalog row org (multi-org safe); else membership org from Supabase auth uid. */
function resolveInventoryProductOrgId(product, membershipOrgId) {
  const fromRaw = product?._raw?.org_id ?? product?.org_id;
  return fromRaw ?? membershipOrgId ?? null;
}

function productStatusKey(product) {
  if (product?.is_active === false) return "inactive";
  if (product?.item_type === "service") return "active";
  const stock = Number(product?.stock_on_hand ?? 0);
  const threshold = Number(product?.reorder_level ?? 10);
  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  return "active";
}

function compareProducts(a, b, key, direction) {
  const dir = direction === "desc" ? -1 : 1;
  const cmpStr = (x, y) => {
    const xs = String(x ?? "").toLowerCase();
    const ys = String(y ?? "").toLowerCase();
    if (xs < ys) return -1 * dir;
    if (xs > ys) return 1 * dir;
    return 0;
  };
  const cmpNum = (x, y) => {
    const xn = Number(x) || 0;
    const yn = Number(y) || 0;
    if (xn < yn) return -1 * dir;
    if (xn > yn) return 1 * dir;
    return 0;
  };

  switch (key) {
    case "category":
      return cmpStr(a.category, b.category) || cmpStr(a.name, b.name);
    case "sku":
      return cmpStr(a.sku || a.barcode, b.sku || b.barcode) || cmpStr(a.name, b.name);
    case "quantity":
      return cmpNum(a.stock_on_hand, b.stock_on_hand) || cmpStr(a.name, b.name);
    case "cost":
      return cmpNum(a.cost, b.cost) || cmpStr(a.name, b.name);
    case "price":
      return cmpNum(a.price, b.price) || cmpStr(a.name, b.name);
    case "status":
      return cmpStr(productStatusKey(a), productStatusKey(b)) || cmpStr(a.name, b.name);
    case "type":
      return cmpStr(a.item_type, b.item_type) || cmpStr(a.name, b.name);
    case "name":
    default:
      return cmpStr(a.name, b.name);
  }
}

export default function Inventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const userProfile = useAppStore((s) => s.userProfile);
  const userCurrency = userProfile?.currency || "ZAR";

  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [pendingBarcode, setPendingBarcode] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quantityFilter, setQuantityFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const [toolsView, setToolsView] = useState("actions");
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [industryTemplatesOpen, setIndustryTemplatesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogDialogItem, setCatalogDialogItem] = useState(null);
  const [catalogDialogType, setCatalogDialogType] = useState("service");

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
      const code = String(barcode || "").trim().toLowerCase();
      if (!code) return null;
      return (
        products
          .filter((p) => p.item_type === "product")
          .find((p) => {
            const sku = String(p.sku || "").trim().toLowerCase();
            const bc = String(p.barcode || "").trim().toLowerCase();
            return sku === code || bc === code;
          }) || null
      );
    },
    [products]
  );

  const getOrgIdForCurrentUser = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUid = sessionData?.session?.user?.id;
    if (!authUid) return null;
    try {
      return await resolveActiveOrgIdForUser(authUid);
    } catch (error) {
      console.warn("Inventory: failed to resolve org_id", error);
      return null;
    }
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
          barcode,
          category,
          image_url,
          item_type,
          default_unit,
          min_quantity,
          stock_quantity,
          stock_capacity,
          low_stock_threshold,
          price,
          cost_price,
          is_active,
          created_at,
          updated_at
        `.replace(/\s+/g, " ")
      )
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return normalizeCatalogRows(rows);
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
    setIsLoading(true);
    setLoadError("");
    try {
      const [p, t, d] = await Promise.allSettled([loadProducts(), loadTransactions(), loadDeliveries()]);
      if (p.status === "fulfilled") setProducts(p.value);
      if (t.status === "fulfilled") setTransactions(t.value);
      if (d.status === "fulfilled") setDeliveries(d.value);

      // Transactions and deliveries are supplementary (Tools sheet only) — log but don't crash.
      if (t.status === "rejected") {
        console.warn("Inventory: transactions load skipped", t.reason?.message || t.reason);
      }

      if (p.status === "rejected") {
        const raw = String(p.reason?.message || p.reason || "");
        throw new Error(raw || "Failed to load products.");
      }
    } finally {
      setIsLoading(false);
    }
    await invalidateServicesCatalog(queryClient);
  }, [loadDeliveries, loadProducts, loadTransactions, queryClient]);

  useEffect(() => {
    if (!user?.id) return;
    refetchAll().catch((e) => {
      console.error("Inventory: initial load failed", e);
      const msg = String(e?.message || "Failed to load inventory data. Please refresh and try again.");
      setLoadError(msg);
      toast({
        title: "✗ Inventory Load Failed",
        description: msg,
        variant: "destructive",
      });
    });
  }, [refetchAll, toast, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

        const { error: rpcErr } = await supabase.rpc("adjust_inventory_stock", {
          p_product_id: product_id,
          p_org_id: resolvedOrgId,
          p_delta: qty,
          p_type: "in",
          p_source: notes || "barcode_receive",
          p_reference_id: null,
        });
        if (rpcErr) throw rpcErr;

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
          .select("id, stock_quantity")
          .eq("id", product_id)
          .eq("org_id", resolvedOrgId)
          .maybeSingle();
        if (getErr) throw getErr;
        if (!currentRow?.id) {
          throw new Error("Product not found in your organization.");
        }

        const dbStock = Number(currentRow.stock_quantity ?? 0) || 0;
        if (dbStock < qty) {
          throw new Error(`Insufficient stock. Available stock is ${dbStock}.`);
        }

        const { error: rpcErr } = await supabase.rpc("adjust_inventory_stock", {
          p_product_id: product_id,
          p_org_id: resolvedOrgId,
          p_delta: -qty,
          p_type: "out",
          p_source: "manual_sale",
          p_reference_id: null,
        });
        if (rpcErr) throw rpcErr;

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
    return products.filter(
      (p) =>
        p.item_type === "product" &&
        (p.stock_on_hand || 0) <= (p.reorder_level || 10)
    );
  }, [products]);

  const inventoryProducts = useMemo(
    () => products.filter((p) => p.item_type === "product"),
    [products]
  );

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const c = String(p.category || "").trim();
      if (c) set.add(c);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesQuery = (p) =>
      !q ||
      String(p.name ?? "").toLowerCase().includes(q) ||
      String(p.sku ?? "").toLowerCase().includes(q) ||
      String(p.barcode ?? "").toLowerCase().includes(q) ||
      String(p.category ?? "").toLowerCase().includes(q);

    return products.filter((p) => {
      if (!matchesQuery(p)) return false;

      if (typeFilter === "product" && p.item_type !== "product") return false;
      if (typeFilter === "service" && p.item_type !== "service") return false;

      if (statusFilter === "active" && productStatusKey(p) !== "active") return false;

      if (categoryFilter !== "all") {
        const cat = String(p.category || "").trim();
        if (cat !== categoryFilter) return false;
      }

      if (p.item_type === "product" && quantityFilter !== "all") {
        const stock = Number(p.stock_on_hand ?? 0);
        const threshold = Number(p.reorder_level ?? 10);
        if (quantityFilter === "out" && stock > 0) return false;
        if (quantityFilter === "low" && (stock <= 0 || stock > threshold)) return false;
        if (quantityFilter === "in_stock" && stock <= 0) return false;
      }

      const price = Number(p.price ?? 0);
      if (priceFilter === "under_50" && price >= 50) return false;
      if (priceFilter === "50_200" && (price < 50 || price > 200)) return false;
      if (priceFilter === "over_200" && price <= 200) return false;

      return true;
    });
  }, [categoryFilter, priceFilter, products, quantityFilter, search, statusFilter, typeFilter]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    list.sort((a, b) => compareProducts(a, b, sortKey, sortDirection));
    return list;
  }, [filteredProducts, sortDirection, sortKey]);

  const totalFiltered = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [pageSize, safePage, sortedProducts]);

  const handleSort = useCallback(
    (key) => {
      if (sortKey === key) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDirection("asc");
      }
    },
    [sortKey]
  );

  const profileAvatarUrl = useMemo(() => {
    const raw = userProfile?.avatar_url || user?.avatar_url || "";
    if (!raw) return null;
    const resolved = AssetService.getLogo(raw);
    return resolved && resolved !== AssetService.FALLBACK_LOGO ? resolved : null;
  }, [user?.avatar_url, userProfile?.avatar_url]);

  const profileInitials = useMemo(() => {
    const name = String(userProfile?.full_name || user?.full_name || "").trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    const email = String(userProfile?.email || user?.email || "").trim();
    return email ? email[0].toUpperCase() : "U";
  }, [user?.email, user?.full_name, userProfile?.email, userProfile?.full_name]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, categoryFilter, quantityFilter, priceFilter, pageSize]);

  const openCatalogDialog = useCallback((row, type = "service") => {
    setCatalogDialogItem(row || null);
    setCatalogDialogType(row?.item_type || type);
    setCatalogDialogOpen(true);
  }, []);

  const handleEditRow = useCallback(
    (row) => {
      if (row?.item_type !== "product") {
        openCatalogDialog(row);
        return;
      }
      setEditingProduct(row);
      setProductDialogOpen(true);
    },
    [openCatalogDialog]
  );

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
          barcode: (productData?.barcode || "").trim() || null,
          category: (productData?.category || "").trim() || null,
          image_url: productData?.image_url || null,
          default_unit: toDbDefaultUnit(productData?.count_style, editingProduct?._raw?.default_unit),
          stock_quantity: toInt(productData?.stock_on_hand),
          stock_capacity: Number(productData?.stock_capacity) > 0 ? Number(productData.stock_capacity) : null,
          low_stock_threshold: toInt(productData?.reorder_level || 10),
          cost_price: Number(productData?.cost ?? 0) || 0,
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

        const membershipOrgId = await getOrgIdForCurrentUser();
        const product = products.find((p) => p.id === delivery.product_id);
        const resolvedOrgId = resolveInventoryProductOrgId(product, membershipOrgId);
        if (!resolvedOrgId) {
          throw new Error("No organization found for this delivery.");
        }

        const { error: rpcErr } = await supabase.rpc("adjust_inventory_stock", {
          p_product_id: delivery.product_id,
          p_org_id: resolvedOrgId,
          p_delta: qty,
          p_type: "in",
          p_source: "delivery",
          p_reference_id: delivery.id,
        });
        if (rpcErr) throw rpcErr;

        if (!alreadyMarkedDelivered) {
          const { error: updDelErr } = await supabase
            .from("deliveries")
            .update({ status: "delivered", updated_date: new Date().toISOString() })
            .eq("id", delivery.id);
          if (updDelErr) throw updDelErr;
        }

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
    [getOrgIdForCurrentUser, products, refetchAll, toast]
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
        const deliveryProduct = products.find((p) => p.id === deliveryData.product_id);
        const deliveryOrgId = deliveryProduct?._raw?.org_id ?? deliveryProduct?.org_id ?? null;
        const baseFields = {
          product_id: deliveryData.product_id,
          org_id: deliveryOrgId,
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

  const handleExportCsv = useCallback(() => {
    if (sortedProducts.length === 0) return;
    setIsExportingCsv(true);
    try {
      const csvContent = servicesToCsv(catalogRowsToCsvSource(sortedProducts));
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `catalog_export_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Export complete",
        description: `${sortedProducts.length} item(s) exported.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Catalog export failed:", error);
      toast({
        title: "Export failed",
        description: error?.message || "Failed to export.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCsv(false);
    }
  }, [sortedProducts, toast]);

  const handleImportCsvFile = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      e.target.value = "";
      if (!file) return;
      setIsImportingCsv(true);
      try {
        const text = await file.text();
        const { headers, rows } = parseServiceCsv(text);
        let created = 0;
        let skipped = 0;
        for (const row of rows) {
          const payload = csvRowToServicePayload(headers, row);
          if (!payload) {
            skipped++;
            continue;
          }
          try {
            await Service.create(payload);
            created++;
          } catch (err) {
            console.warn("Catalog CSV import row failed:", payload.name, err);
            skipped++;
          }
        }
        await refetchAll();
        toast({
          title: "Import complete",
          description: `${created} item(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
          variant: "default",
        });
      } catch (error) {
        console.error("Catalog import failed:", error);
        toast({
          title: "Import failed",
          description: error?.message || "Could not parse CSV.",
          variant: "destructive",
        });
      } finally {
        setIsImportingCsv(false);
      }
    },
    [refetchAll, toast]
  );

  return (
    <>
      <ManageProductsView
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        profileAvatarUrl={profileAvatarUrl}
        profileInitials={profileInitials}
        onCreateCategory={() => setCategoryDialogOpen(true)}
        onAddProduct={() => {
          setEditingProduct(null);
          setProductDialogOpen(true);
        }}
        onAddService={() => openCatalogDialog(null, "service")}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categories={categories}
        quantityFilter={quantityFilter}
        onQuantityFilterChange={setQuantityFilter}
        priceFilter={priceFilter}
        onPriceFilterChange={setPriceFilter}
        onOpenTools={() => {
          setToolsView("actions");
          setToolsSheetOpen(true);
        }}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={refetchAll}
        products={paginatedProducts}
        currencyCode={userCurrency}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
        onOpenProduct={openCatalogDialog}
        onEditProduct={handleEditRow}
        onDeleteProduct={handleDeleteProduct}
        page={safePage}
        pageSize={pageSize}
        totalItems={totalFiltered}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        isImporting={isImportingCsv}
        isExporting={isExportingCsv}
        exportDisabled={sortedProducts.length === 0}
        onImportFile={handleImportCsvFile}
        onExportCsv={handleExportCsv}
        onOpenIndustryTemplates={() => setIndustryTemplatesOpen(true)}
      />

      <IndustryTemplatesDialog
        open={industryTemplatesOpen}
        onOpenChange={setIndustryTemplatesOpen}
        userId={user?.id}
        currencyCode={userCurrency}
        onComplete={refetchAll}
      />

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        existingCategories={categories}
        onUseCategory={(name) => {
          setEditingProduct({ category: name, item_type: "product" });
          setProductDialogOpen(true);
        }}
      />

      <InventoryToolsSheet
        open={toolsSheetOpen}
        onOpenChange={setToolsSheetOpen}
        view={toolsView}
        onViewChange={setToolsView}
        products={inventoryProducts}
        transactions={transactions}
        deliveries={deliveries}
        lowStockProducts={lowStockProducts}
        reorderingIds={reorderingIds}
        onScanReceive={() => {
          setToolsSheetOpen(false);
          setScannerMode("receive");
          setScannerQty(1);
          setScannerOpen(true);
        }}
        onScanSell={() => {
          setToolsSheetOpen(false);
          setScannerMode("sell");
          setScannerQty(1);
          setScannerOpen(true);
        }}
        onRecordSale={() => {
          setToolsSheetOpen(false);
          setSellDialogOpen(true);
        }}
        onNewDelivery={() => {
          setToolsSheetOpen(false);
          setEditingDelivery(null);
          setDeliveryDialogOpen(true);
        }}
        onReorder={handleReorder}
        onEditDelivery={(d) => {
          setEditingDelivery(d);
          setDeliveryDialogOpen(true);
        }}
        onDeleteDelivery={handleDeleteDelivery}
        onMarkDelivered={handleMarkDelivered}
      />

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) setEditingProduct(null);
        }}
        product={editingProduct}
        onSave={handleSaveProduct}
      />

      <CatalogItemDialog
        open={catalogDialogOpen}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) setCatalogDialogItem(null);
        }}
        item={catalogDialogItem}
        defaultType={catalogDialogType}
        onSaved={refetchAll}
      />

      <SellStockDialog
        open={sellDialogOpen}
        onOpenChange={setSellDialogOpen}
        products={inventoryProducts}
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
        products={inventoryProducts}
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
    </>
  );
}
