import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  RotateCcw,
  Printer,
  Download,
  Mail,
  X,
  Package,
  Loader2,
  ArrowLeft,
  Check,
  ScanBarcode,
  Pause,
  Play,
  FileText,
  Store,
  UserPlus,
  HelpCircle,
  Receipt,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import ProductThumbnail from "@/components/inventory/ProductThumbnail";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgBrands } from "@/hooks/useOrgBrands";
import { resolveBusinessLogoUrl } from "@/lib/brandingLogos";
import LogoImage from "@/components/shared/LogoImage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { isPosOnlyStaff, posAccessPath } from "@shared/posStaffInvite.js";
import PosStaffInviteSheet from "@/components/pos/PosStaffInviteSheet";
import PosTillStaffSheet from "@/components/pos/PosTillStaffSheet";
import { formatCurrency } from "@/utils/currencyCalculations";
import { createPageUrl, triggerHaptic } from "@/utils";
import {
  checkoutPosSale,
  convertPosSaleToInvoice,
  emailPosReceipt,
  fetchPosCatalog,
  listPosRegisters,
  listPosSales,
  listPosSessions,
  getPosSession,
  openPosSession,
  closePosSession,
  returnPosSale,
  fetchPosSaleAudit,
} from "@/services/PosIntegrationService";
import { cn } from "@/lib/utils";
import { usePosConnectivity } from "@/hooks/usePosConnectivity";
import BarcodeScannerDialog from "@/components/inventory/BarcodeScannerDialog";
import {
  buildPosCodeIndex,
  filterPosProducts,
  isPosScanQuery,
  listPosCatalogCategories,
  lookupPosProductByCode,
} from "@/lib/pos/posProductSearch";
import { createPosWedgeBuffer, POS_SCAN_COMMIT_MS, isRapidScanGap } from "@/lib/pos/posWedgeScan";
import { displayPosBarcode } from "@/lib/pos/posBarcode";
import { applyPosSaleDiscount, catalogUnitPrice, computeCashChange } from "../../../server/src/pos/posCheckoutMath.js";
import { addPosCartLine, posCartSubtotal, posProductStock, posStockLabel, setPosCartQty } from "@/lib/pos/posCart";
import { refundRailForSale, remainingLinesForTill } from "../../../server/src/pos/posReturnMath.js";
import { clearHeldCart, hydrateHeldCart, readHeldCart, writeHeldCart } from "@/lib/pos/posHeldCart";
import { pickActiveRegister, readActiveRegisterId, writeActiveRegisterId } from "@/lib/pos/posRegisterStorage";
import { endPosAccess, getPosAccessProfile, getPosAccessToken } from "@/lib/pos/posAccessClient";
import { resolveAssignedTill } from "../../../server/src/pos/posRegisterMath.js";
import { WALK_IN_CUSTOMER_LABEL } from "@/lib/pos/posCustomerSearch";
import { invalidateClientDomain, invalidateRevenueReadModels } from "@/lib/queryInvalidation";
import PosCustomerDialog from "@/components/pos/PosCustomerDialog";
import PosReceiptSheet from "@/components/pos/PosReceiptSheet";
import PosCashKeypad from "@/components/pos/PosCashKeypad";
import PosConnectivityBar from "@/components/pos/PosConnectivityBar";
import { popularProductIdsFromSales, scopePosCatalog } from "@/lib/pos/posPopularProducts.js";
import {
  buildPosReceiptView,
  openPosReceiptPrint,
  receiptPdfFilename,
} from "../../../server/src/pos/posReceipt.js";
import generatePdfFromElement, { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function cashSuggestions(total) {
  const due = roundMoney(total);
  const roundTo = (step) => Math.ceil(due / step) * step;
  const candidates = [due, roundTo(10), roundTo(20), roundTo(50), 50, 100, 200, 500];
  const seen = new Set();
  return candidates
    .map((n) => roundMoney(n))
    .filter((n) => n >= due && !seen.has(n) && seen.add(n))
    .slice(0, 6);
}

function PosCatalogProductCard({ product, currency, inCart, onAdd, onQty }) {
  const stock = posProductStock(product);
  const stockUi = posStockLabel(stock, { compact: true });
  const out = stockUi.tone === "out";
  const hasImage = Boolean(product.image_url);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left shadow-none",
        out ? "border-border opacity-50" : "border-border/80 hover:border-primary/40",
        inCart ? "border-primary" : ""
      )}
    >
      <button
        type="button"
        disabled={out}
        aria-label={`Add ${product.name} to cart`}
        onClick={() => onAdd(product)}
        className="flex min-w-0 flex-1 flex-col touch-manipulation select-none active:bg-muted/30"
      >
        <div
          className={cn(
            "relative flex w-full items-center justify-center bg-muted/30 px-1.5 py-1",
            hasImage ? "h-[4.5rem] sm:h-20" : "h-10 sm:h-11"
          )}
        >
          <ProductThumbnail
            imageUrl={product.image_url}
            name={product.name}
            fit="contain"
            className="h-full w-full rounded-none border-0 bg-transparent"
          />
          {inCart ? (
            <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
              {inCart.quantity}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug">{product.name}</p>
          <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5">
            <p className="text-sm font-bold tabular-nums sm:text-[15px]">
              {formatCurrency(catalogUnitPrice(product), currency)}
            </p>
            <p
              className={cn(
                "shrink-0 text-[11px] font-medium leading-none",
                stockUi.tone === "out"
                  ? "text-destructive"
                  : stockUi.tone === "low"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              )}
            >
              {stockUi.text}
            </p>
          </div>
        </div>
      </button>
      {inCart && !out ? (
        <div className="flex items-center justify-between gap-1 border-t border-border px-1 py-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 min-h-11 min-w-11 touch-manipulation"
            onClick={() => onQty(product.id, inCart.quantity - 1)}
            aria-label={`Decrease ${product.name}`}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-5 text-center text-xs font-semibold tabular-nums">{inCart.quantity}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 min-h-11 min-w-11 touch-manipulation"
            onClick={() => onAdd(product)}
            aria-label={`Increase ${product.name}`}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CartLineList({ cart, currency, onQty }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const commitEdit = (line) => {
    setEditingId(null);
    const n = Math.trunc(Number(draft));
    if (!Number.isFinite(n) || n <= 0) {
      onQty(line.product_id, 0);
      return;
    }
    onQty(line.product_id, n);
  };

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <ShoppingCart className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Cart is empty</p>
        <p className="text-xs text-muted-foreground">Tap a product or scan a barcode.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {cart.map((line) => (
        <li key={line.product_id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{line.name}</p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {formatCurrency(line.unit_price, currency)} × {line.quantity}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(line.unit_price * line.quantity, currency)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 min-h-11 min-w-11 touch-manipulation"
              onClick={() => onQty(line.product_id, line.quantity - 1)}
              aria-label={`Decrease ${line.name}`}
            >
              <Minus className="size-3.5" />
            </Button>
            {editingId === line.product_id ? (
              <Input
                autoFocus
                inputMode="numeric"
                className="h-11 w-12 px-1 text-center text-sm font-semibold tabular-nums"
                value={draft}
                aria-label={`Quantity for ${line.name}`}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitEdit(line)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEdit(line);
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="h-11 w-11 rounded-input text-sm font-semibold tabular-nums hover:bg-muted"
                onClick={() => {
                  setEditingId(line.product_id);
                  setDraft(String(line.quantity));
                }}
                aria-label={`Edit quantity for ${line.name}`}
              >
                {line.quantity}
              </button>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 min-h-11 min-w-11 touch-manipulation"
              onClick={() => onQty(line.product_id, line.quantity + 1)}
              aria-label={`Increase ${line.name}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 min-h-11 min-w-11 touch-manipulation text-muted-foreground"
            onClick={() => onQty(line.product_id, 0)}
            aria-label={`Remove ${line.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function PosTerminal({ requestedTillId = null } = {}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, logout } = useAuth();
  const { hasPermission, jobFunction, companyRole, isOrgOwner, ctx: companyCtx } = useCompanyContext();
  const canSell = hasPermission(PERMISSIONS.POS_SELL);
  const canDiscount = hasPermission(PERMISSIONS.POS_DISCOUNT);
  const canRefund = hasPermission(PERMISSIONS.POS_REFUND);
  const canCloseRegister = hasPermission(PERMISSIONS.POS_CLOSE_REGISTER);
  const canInvitePosStaff = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const posOnlyStaff = isPosOnlyStaff({ isOrgOwner, companyRole, jobFunction });
  const { checkoutAllowed, serverWriteAllowed, blockedReason, state: connectivityState } =
    usePosConnectivity();
  const { brands, orgId } = useOrgBrands();
  const currency = profile?.currency || user?.currency || "ZAR";
  const posProfile = getPosAccessProfile();
  const cashierName = profile?.full_name || user?.email || posProfile?.name || posProfile?.email || "";

  const searchRef = useRef(null);
  const receiptPdfRef = useRef(null);
  const scanDebounceRef = useRef(null);
  const lastSearchKeyAtRef = useRef(0);
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [query, setQuery] = useState("");
  const [scanMode, setScanMode] = useState(true);
  const [cameraContinuous, setCameraContinuous] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [attachedCustomer, setAttachedCustomer] = useState(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [digitalOpen, setDigitalOpen] = useState(false);
  const [payMethodOpen, setPayMethodOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tendered, setTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptEmailTo, setReceiptEmailTo] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [todaySales, setTodaySales] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayLoading, setTodayLoading] = useState(false);
  const [saleAudit, setSaleAudit] = useState([]);
  const [returnSale, setReturnSale] = useState(null);
  const [returnQtys, setReturnQtys] = useState({});
  const [refundAsCash, setRefundAsCash] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("0");
  const [heldCart, setHeldCart] = useState(null);
  const [invoiceClientPick, setInvoiceClientPick] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [registers, setRegisters] = useState([]);
  const [activeRegister, setActiveRegister] = useState(null);
  const [tillGateError, setTillGateError] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [openSession, setOpenSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionDegraded, setSessionDegraded] = useState(false);
  const [startShiftOpen, setStartShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [staffManageOpen, setStaffManageOpen] = useState(false);
  const [openingDraft, setOpeningDraft] = useState("0");
  const [closingDraft, setClosingDraft] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const registerBrand = useMemo(
    () => brands.find((row) => row.id === activeRegister?.company_id) || null,
    [brands, activeRegister?.company_id]
  );
  const tillBrandName =
    registerBrand?.name || activeRegister?.company_name || profile?.company_name || "Paidly";
  const businessLogoUrl = resolveBusinessLogoUrl(profile || user);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const rows = await fetchPosCatalog({ registerId: activeRegister?.id || undefined });
      setProducts(rows);
      const ids = new Set(rows.map((row) => row.id));
      setCart((prev) => prev.filter((line) => ids.has(line.product_id)));
    } catch (err) {
      setCatalogError(err?.message || "Product catalogue unavailable.");
      toast({
        title: "Product catalogue unavailable.",
        description: err?.message || "Check inventory in the back office.",
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [activeRegister?.id, toast]);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const result = await listPosSales({ limit: 100, today: true });
      setTodaySales(result.sales);
      setTodayTotal(result.totalToday);
    } catch {
      setTodaySales([]);
      setTodayTotal(0);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadRegisters = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await listPosRegisters();
      setRegisters(data.registers);
      if (requestedTillId) {
        const allowed = resolveAssignedTill(
          {
            companyRole,
            jobFunction,
            isOrgOwner,
            posRegisterId: companyCtx?.posRegisterId || null,
          },
          requestedTillId
        );
        if (!allowed.ok) {
          setTillGateError(allowed.error || "This till is not assigned to you.");
          setActiveRegister(null);
          return;
        }
      }
      const next = pickActiveRegister(
        data.registers,
        readActiveRegisterId(orgId),
        companyCtx?.posRegisterId || null,
        requestedTillId || null
      );
      if (requestedTillId && !next) {
        setTillGateError("This till is not available on your account.");
        setActiveRegister(null);
        return;
      }
      setTillGateError(null);
      setActiveRegister(next);
      if (next?.id) writeActiveRegisterId(orgId, next.id);
    } catch {
      setRegisters([]);
    }
  }, [
    orgId,
    companyCtx?.posRegisterId,
    requestedTillId,
    companyRole,
    jobFunction,
    isOrgOwner,
  ]);

  const loadSession = useCallback(async (register) => {
    if (!register?.id) {
      setOpenSession(null);
      setSessionLoading(false);
      return;
    }
    setSessionLoading(true);
    try {
      const rows = await listPosSessions({ register_id: register.id, status: "open", limit: 1 });
      setOpenSession(rows[0] || null);
      setSessionDegraded(false);
    } catch (err) {
      const msg = String(err?.message || "");
      setOpenSession(null);
      setSessionDegraded(/database update|pos_register_sessions/i.test(msg));
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadToday();
  }, [loadCatalog, loadToday]);

  useEffect(() => {
    if (!completedSale?.id) {
      setSaleAudit([]);
      return undefined;
    }
    let cancelled = false;
    fetchPosSaleAudit(completedSale.id)
      .then((events) => {
        if (!cancelled) setSaleAudit(events);
      })
      .catch(() => {
        if (!cancelled) setSaleAudit([]);
      });
    return () => {
      cancelled = true;
    };
  }, [completedSale?.id]);

  useEffect(() => {
    void loadRegisters();
  }, [loadRegisters]);

  useEffect(() => {
    void loadSession(activeRegister);
  }, [activeRegister, loadSession]);

  useEffect(() => {
    setHeldCart(readHeldCart(orgId));
  }, [orgId]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (checkoutAllowed) return;
    setPayMethodOpen(false);
    setCashOpen(false);
    setCardOpen(false);
    setDigitalOpen(false);
  }, [checkoutAllowed]);

  const categories = useMemo(() => listPosCatalogCategories(products), [products]);

  useEffect(() => {
    if (category === "all" || category === "popular") return;
    if (!categories.some((row) => row.name === category)) setCategory("all");
  }, [categories, category]);

  const codeIndex = useMemo(() => buildPosCodeIndex(products), [products]);

  const popularIds = useMemo(() => popularProductIdsFromSales(todaySales), [todaySales]);
  const categoryScoped = useMemo(
    () => scopePosCatalog(products, category, popularIds),
    [products, category, popularIds]
  );
  const filteredProducts = useMemo(
    () => filterPosProducts(category === "popular" ? categoryScoped : products, {
      query,
      category: category === "popular" ? "all" : category,
      codeIndex,
    }),
    [products, categoryScoped, query, category, codeIndex]
  );

  const subtotal = useMemo(() => posCartSubtotal(cart), [cart]);
  const totals = useMemo(() => applyPosSaleDiscount(subtotal, discountAmount), [subtotal, discountAmount]);
  const cartTotal = totals.total;
  const needsShift = Boolean(
    canSell && activeRegister?.id && !openSession && !sessionDegraded && !sessionLoading
  );
  const closePreviewVariance = useMemo(() => {
    if (!openSession || closingDraft === "") return null;
    const counted = roundMoney(Number(closingDraft));
    if (!Number.isFinite(counted) || counted < 0) return null;
    return roundMoney(counted - (Number(openSession.expected_cash) || 0));
  }, [openSession, closingDraft]);
  const receiptLogoUrl = businessLogoUrl || null;
  const receiptView = useMemo(() => {
    if (!completedSale) return null;
    return buildPosReceiptView(completedSale, {
      brandName: completedSale.brand_name || tillBrandName,
      logoUrl: receiptLogoUrl,
      cashierName,
      currency: completedSale.currency || currency,
    });
  }, [completedSale, tillBrandName, receiptLogoUrl, cashierName, currency]);
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const returnPriorEvents = useMemo(
    () => (returnSale ? todaySales.filter((row) => row.parent_event_id === returnSale.id) : []),
    [returnSale, todaySales]
  );
  const returnLines = useMemo(
    () => (returnSale ? remainingLinesForTill(returnSale, returnPriorEvents) : []),
    [returnSale, returnPriorEvents]
  );
  const returnTotal = useMemo(
    () =>
      roundMoney(
        returnLines.reduce((sum, line) => {
          const qty = Math.min(Math.max(0, Math.trunc(Number(returnQtys[line.product_id]) || 0)), line.remaining);
          return sum + line.unit_price * qty;
        }, 0)
      ),
    [returnLines, returnQtys]
  );
  const returnRail = returnSale
    ? refundRailForSale(returnSale.payment_method, { refundAsCash })
    : null;
  const cashTender = useMemo(() => computeCashChange(cartTotal, tendered), [cartTotal, tendered]);
  const tenderChips = useMemo(() => cashSuggestions(cartTotal), [cartTotal]);

  useEffect(() => {
    if (discountAmount > subtotal) setDiscountAmount(subtotal);
  }, [discountAmount, subtotal]);

  const focusScanner = useCallback(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const addProduct = useCallback(
    (product, qty = 1) => {
      const stock = posProductStock(product);
      if (stock <= 0) {
        toast({ title: "Out of stock", description: product.name, variant: "destructive" });
        setScanStatus({ tone: "error", text: "Out of stock" });
        return false;
      }
      let result;
      setCart((prev) => {
        result = addPosCartLine(prev, product, qty);
        return result.cart;
      });
      if (result?.error === "INSUFFICIENT_STOCK") {
        toast({
          title: "Only " + stock + " available.",
          description: product.name,
          variant: "destructive",
        });
        setScanStatus({ tone: "error", text: `Only ${stock} available.` });
        return false;
      }
      triggerHaptic(10);
      setScanStatus({ tone: "ok", text: `${product.name} · ${result?.cart?.find((l) => l.product_id === product.id)?.quantity || 1}` });
      return true;
    },
    [toast]
  );

  const applyScannedCode = useCallback(
    (raw, { keepScanner = false } = {}) => {
      const code = displayPosBarcode(raw);
      setQuery("");
      if (!keepScanner) setScannerOpen(false);

      if (catalogLoading && products.length === 0) {
        toast({ title: "Product catalogue unavailable.", variant: "destructive" });
        setScanStatus({ tone: "error", text: "Product catalogue unavailable." });
        focusScanner();
        return false;
      }
      if (catalogError && products.length === 0) {
        toast({ title: "Product catalogue unavailable.", variant: "destructive" });
        setScanStatus({ tone: "error", text: "Product catalogue unavailable." });
        focusScanner();
        return false;
      }
      if (!code) {
        focusScanner();
        return false;
      }

      const product = lookupPosProductByCode(codeIndex, code);
      if (!product) {
        toast({
          title: "Barcode not found",
          description: `${code} isn't linked to a product.`,
          variant: "destructive",
          duration: 8000,
          action: (
            <div className="flex flex-col gap-1">
              {posOnlyStaff ? null : (
                <ToastAction
                  altText="Add product"
                  onClick={() =>
                    navigate(`${createPageUrl("Services")}?barcode=${encodeURIComponent(code)}`)
                  }
                >
                  Add Product
                </ToastAction>
              )}
              <ToastAction
                altText="Scan again"
                onClick={() => {
                  focusScanner();
                }}
              >
                Scan Again
              </ToastAction>
            </div>
          ),
        });
        setScanStatus({ tone: "error", text: "Barcode not found" });
        focusScanner();
        return false;
      }
      addProduct(product);
      focusScanner();
      return true;
    },
    [addProduct, catalogError, catalogLoading, codeIndex, focusScanner, navigate, posOnlyStaff, products.length, toast]
  );

  const setQty = (productId, quantity) => {
    setCart((prev) => setPosCartQty(prev, productId, quantity));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
    setCartSheetOpen(false);
  };

  const holdCart = () => {
    if (!orgId || cart.length === 0) return;
    const ok = writeHeldCart(orgId, {
      cart: cart.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
        name: line.name,
        sku: line.sku,
      })),
      discount_amount: totals.discount_amount,
      client_id: clientId || null,
      client_query: clientQuery || "",
      held_at: new Date().toISOString(),
    });
    if (!ok) {
      toast({ title: "Could not hold sale", description: "This browser blocked session storage.", variant: "destructive" });
      return;
    }
    setHeldCart(readHeldCart(orgId));
    setCart([]);
    setDiscountAmount(0);
    setClientId("");
    setClientQuery("");
    setAttachedCustomer(null);
    setCartSheetOpen(false);
    triggerHaptic(10);
    toast({ title: "Sale held on this device", description: "Not saved to the server. Resume before you close the tab." });
  };

  const resumeHeldCart = () => {
    if (!orgId) return;
    if (cart.length > 0) {
      toast({ title: "Cart has items", description: "Clear or hold this sale before resuming." });
      return;
    }
    const restored = hydrateHeldCart(readHeldCart(orgId), products);
    if (!restored.ok) {
      clearHeldCart(orgId);
      setHeldCart(null);
      toast({ title: "Held sale is empty", description: "Those products are no longer in stock or in the catalog." });
      return;
    }
    setCart(restored.cart);
    setDiscountAmount(restored.discount_amount);
    setClientId(restored.client_id);
    setClientQuery(restored.client_query);
    setAttachedCustomer(
      restored.client_id ? { id: restored.client_id, name: restored.client_query || "Customer" } : null
    );
    clearHeldCart(orgId);
    setHeldCart(null);
    triggerHaptic(10);
    if (restored.skipped > 0) {
      toast({ title: "Some held items were skipped", description: "Stock or catalog changed since the hold." });
    }
  };

  const applyDiscountDraft = () => {
    const next = applyPosSaleDiscount(subtotal, discountDraft);
    setDiscountAmount(next.discount_amount);
    setDiscountOpen(false);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const text = query;
    if (!displayPosBarcode(text)) return;
    if (lookupPosProductByCode(codeIndex, text) || isPosScanQuery(text)) {
      applyScannedCode(text);
    }
  };

  const handleSearchPaste = (event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (lookupPosProductByCode(codeIndex, text) || isPosScanQuery(text)) {
      event.preventDefault();
      applyScannedCode(text);
    }
  };

  const handleSearchChange = (event) => {
    const value = event.target.value;
    const now = Date.now();
    const gap = now - lastSearchKeyAtRef.current;
    lastSearchKeyAtRef.current = now;
    setQuery(value);
    window.clearTimeout(scanDebounceRef.current);
    if (!isRapidScanGap(gap) || !(lookupPosProductByCode(codeIndex, value) || isPosScanQuery(value))) {
      return;
    }
    scanDebounceRef.current = window.setTimeout(() => {
      if (lookupPosProductByCode(codeIndex, value) || isPosScanQuery(value)) {
        applyScannedCode(value);
      }
    }, POS_SCAN_COMMIT_MS);
  };

  useEffect(() => {
    const wedge = createPosWedgeBuffer();
    const payBusy =
      scannerOpen ||
      cashOpen ||
      payMethodOpen ||
      customerOpen ||
      discountOpen ||
      cardOpen ||
      digitalOpen ||
      Boolean(completedSale) ||
      startShiftOpen ||
      closeShiftOpen ||
      registerOpen ||
      helpOpen;

    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (payBusy) return;

      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      const typingElsewhere =
        (tag === "input" || tag === "textarea" || el?.isContentEditable) && el !== searchRef.current;
      if (typingElsewhere) return;
      if (el === searchRef.current) return;

      const code = wedge.push(e.key, Date.now());
      if (!code) return;
      if (e.key === "Enter" || e.key === "Tab") e.preventDefault();
      applyScannedCode(code);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    applyScannedCode,
    scannerOpen,
    cashOpen,
    payMethodOpen,
    customerOpen,
    discountOpen,
    cardOpen,
    digitalOpen,
    completedSale,
    startShiftOpen,
    closeShiftOpen,
    registerOpen,
    helpOpen,
  ]);

  useEffect(() => {
    if (!scanStatus) return undefined;
    const id = window.setTimeout(() => setScanStatus(null), 1800);
    return () => window.clearTimeout(id);
  }, [scanStatus]);

  useEffect(() => {
    if (!scanMode) return;
    if (scannerOpen || cashOpen || payMethodOpen || customerOpen || discountOpen || cardOpen || digitalOpen || completedSale) {
      return;
    }
    focusScanner();
  }, [
    scanMode,
    scannerOpen,
    cashOpen,
    payMethodOpen,
    customerOpen,
    discountOpen,
    cardOpen,
    digitalOpen,
    completedSale,
    focusScanner,
  ]);

  const applyInventory = (inventoryResult) => {
    if (!Array.isArray(inventoryResult)) return;
    setProducts((prev) =>
      prev.map((product) => {
        const hit = inventoryResult.find((row) => row.product_id === product.id && row.status === "applied");
        if (!hit || hit.new_stock == null) return product;
        return { ...product, stock_quantity: hit.new_stock };
      })
    );
  };

  const completeCheckout = async ({ paymentMethod, amountTendered }) => {
    if (!canSell || submitting || cart.length === 0) return;
    if (!checkoutAllowed) {
      toast({
        title: "Checkout needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await checkoutPosSale({
        items: cart.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
        })),
        payment_method: paymentMethod,
        discount_amount: totals.discount_amount,
        amount_tendered: paymentMethod === "cash" ? Number(amountTendered) : undefined,
        client_id: clientId || null,
        company_id: activeRegister?.company_id || null,
        register_id: activeRegister?.id || null,
        currency,
        idempotency_key: crypto.randomUUID(),
        brand_name: tillBrandName,
        cashier_name: cashierName,
        customer_name: attachedCustomer?.name || undefined,
        customer_email: attachedCustomer?.email || undefined,
      });
      const sale = result.sale;
      setCompletedSale(sale);
      setReceiptEmailTo(sale.customer_email || attachedCustomer?.email || "");
      setCart([]);
      setDiscountAmount(0);
      setClientId("");
      setClientQuery("");
      setAttachedCustomer(null);
      setCustomerOpen(false);
      setCashOpen(false);
      setCardOpen(false);
      setDigitalOpen(false);
      setPayMethodOpen(false);
      setCartSheetOpen(false);
      triggerHaptic(20);
      applyInventory(result.inventory_result);
      void loadToday();
      void loadSession(activeRegister);
      invalidateRevenueReadModels(queryClient);
    } catch (err) {
      if (err?.code === "SESSION_REQUIRED") {
        setStartShiftOpen(true);
        setOpeningDraft(String(activeRegister?.opening_balance ?? 0));
      }
      toast({
        title: "Sale failed",
        description: err?.message || "Could not complete checkout",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const waitForReceiptNode = async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return receiptPdfRef.current;
  };

  const printCurrentReceipt = () => {
    if (!receiptView) return;
    openPosReceiptPrint(receiptView);
  };

  const downloadCurrentReceipt = async () => {
    if (!receiptView || receiptBusy) return;
    setReceiptBusy("download");
    try {
      const el = await waitForReceiptNode();
      if (!el) throw new Error("Receipt is not ready");
      await generatePdfFromElement(el, receiptPdfFilename(receiptView), {
        includeInvoiceBaseCss: false,
        title: receiptView.saleNumber,
      });
    } catch (err) {
      toast({
        title: "Could not download receipt",
        description: err?.message || "PDF generation failed",
        variant: "destructive",
      });
    } finally {
      setReceiptBusy(null);
    }
  };

  const emailCurrentReceipt = async () => {
    if (!completedSale?.id || receiptBusy) return;
    const to = String(receiptEmailTo || "").trim();
    if (!to) {
      toast({ title: "Enter an email address", variant: "destructive" });
      return;
    }
    setReceiptBusy("email");
    try {
      let base64PDF;
      try {
        const el = await waitForReceiptNode();
        if (el) {
          const blob = await generatePdfBlobFromElement(el, receiptPdfFilename(receiptView));
          base64PDF = await blobToBase64(blob);
        }
      } catch {
        base64PDF = undefined;
      }
      await emailPosReceipt({
        sale_id: completedSale.id,
        to,
        brand_name: tillBrandName,
        cashier_name: cashierName,
        customer_name: receiptView?.customerName,
        base64PDF,
      });
      toast({ title: "Receipt sent", description: to });
    } catch (err) {
      toast({
        title: "Could not email receipt",
        description: err?.message || "Email failed",
        variant: "destructive",
      });
    } finally {
      setReceiptBusy(null);
    }
  };

  const openPay = () => {
    if (!canSell) {
      toast({
        title: "No permission to sell",
        description: "Your company role cannot complete till sales.",
        variant: "destructive",
      });
      return;
    }
    if (!serverWriteAllowed) {
      toast({
        title: "Checkout needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    if (needsShift) {
      setOpeningDraft(String(activeRegister?.opening_balance ?? 0));
      setStartShiftOpen(true);
      return;
    }
    if (cart.length === 0) return;
    setPayMethodOpen(true);
  };

  const startShift = async () => {
    if (!activeRegister?.id || shiftBusy) return;
    if (!serverWriteAllowed) {
      toast({
        title: "Shift needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    setShiftBusy(true);
    try {
      const session = await openPosSession({
        register_id: activeRegister.id,
        opening_balance: Number(openingDraft),
      });
      setOpenSession(session);
      setStartShiftOpen(false);
      toast({ title: "Shift started" });
    } catch (err) {
      toast({
        title: "Could not start shift",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setShiftBusy(false);
    }
  };

  const openCloseShift = async () => {
    if (!openSession?.id) return;
    try {
      const fresh = await getPosSession(openSession.id);
      if (fresh) setOpenSession(fresh);
    } catch {
      /* keep current totals */
    }
    setClosingDraft("");
    setCloseShiftOpen(true);
  };

  const confirmCloseShift = async () => {
    if (!openSession?.id || shiftBusy) return;
    if (!serverWriteAllowed) {
      toast({
        title: "Close shift needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    setShiftBusy(true);
    try {
      const closed = await closePosSession(openSession.id, {
        closing_cash: Number(closingDraft),
      });
      setOpenSession(null);
      setCloseShiftOpen(false);
      const variance = Number(closed?.variance);
      toast({
        title: "Shift closed",
        description: Number.isFinite(variance)
          ? `Variance ${formatCurrency(variance, currency)}`
          : "Cash counted and locked.",
      });
    } catch (err) {
      toast({
        title: "Could not close shift",
        description: err?.message || "Completed sessions cannot be edited.",
        variant: "destructive",
      });
    } finally {
      setShiftBusy(false);
    }
  };

  const openCash = () => {
    if (cart.length === 0) return;
    setPayMethodOpen(false);
    setTendered(String(cartTotal));
    setCashOpen(true);
  };

  const openDigital = () => {
    if (cart.length === 0) return;
    setPayMethodOpen(false);
    setDigitalOpen(true);
  };

  const openCard = () => {
    if (cart.length === 0) return;
    setPayMethodOpen(false);
    setCardOpen(true);
  };

  const convertSaleToInvoice = async (sale, clientOverrideId) => {
    if (!sale?.id || convertBusy) return;
    if (!serverWriteAllowed) {
      toast({
        title: "Invoice copy needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    if ((sale.sale_kind || "sale") === "return") {
      toast({
        title: "Returns cannot become invoices",
        description: "Convert the original sale if the customer needs a tax invoice.",
        variant: "destructive",
      });
      return;
    }
    if (sale.invoice_id) {
      navigate(`${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(sale.invoice_id)}`);
      return;
    }
    const namedClientId = clientOverrideId || sale.client_id;
    if (!namedClientId) {
      setInvoiceClientPick(true);
      setCustomerOpen(true);
      return;
    }
    setConvertBusy(true);
    try {
      const result = await convertPosSaleToInvoice({
        sale_id: sale.id,
        client_id: namedClientId,
      });
      const nextSale = result.sale || { ...sale, invoice_id: result.invoice?.id, client_id: namedClientId };
      setCompletedSale(nextSale);
      setInvoiceClientPick(false);
      toast({
        title: result.already_converted ? "Invoice already exists" : "Tax invoice created",
        description: `${result.invoice?.invoice_number || "Invoice"} is a copy of this settled sale — not a new payment request.`,
      });
      if (result.invoice?.id) {
        navigate(`${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(result.invoice.id)}`);
      }
    } catch (err) {
      if (err?.code === "CLIENT_REQUIRED") {
        setInvoiceClientPick(true);
        setCustomerOpen(true);
        return;
      }
      toast({
        title: "Could not create invoice",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setConvertBusy(false);
    }
  };

  const submitReturn = async (sale) => {
    if (!canRefund || submitting || !sale?.id) return;
    if (!serverWriteAllowed) {
      toast({
        title: "Return needs a connection",
        description: blockedReason,
        variant: "destructive",
      });
      return;
    }
    const items = returnLines
      .map((line) => ({
        product_id: line.product_id,
        quantity: Math.min(Math.max(0, Math.trunc(Number(returnQtys[line.product_id]) || 0)), line.remaining),
      }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) {
      toast({ title: "Select items to return", description: "Set a quantity greater than zero." });
      return;
    }
    setSubmitting(true);
    try {
      const result = await returnPosSale({
        sale_id: sale.id,
        items,
        refund_as_cash: refundAsCash,
        idempotency_key: crypto.randomUUID(),
      });
      setReturnSale(null);
      setReturnQtys({});
      setRefundAsCash(false);
      setCompletedSale(result.sale);
      setReceiptEmailTo(result.sale.customer_email || "");
      applyInventory(result.inventory_result);
      void loadToday();
      void loadSession(activeRegister);
      invalidateRevenueReadModels(queryClient);
    } catch (err) {
      if (err?.code === "SESSION_REQUIRED") {
        setStartShiftOpen(true);
        setOpeningDraft(String(activeRegister?.opening_balance ?? 0));
      }
      toast({
        title: "Return failed",
        description: err?.message || "Could not process return",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnDialog = (sale) => {
    const prior = todaySales.filter((row) => row.parent_event_id === sale.id);
    const lines = remainingLinesForTill(sale, prior);
    if (sale.refund_status === "full" || lines.length === 0) {
      toast({
        title: "Already returned",
        description: "Every item on this sale has already been returned. The original sale was not deleted.",
      });
      return;
    }
    const qtys = {};
    for (const line of lines) qtys[line.product_id] = line.remaining;
    setReturnQtys(qtys);
    setRefundAsCash(false);
    setReturnSale(sale);
  };

  const customerLabel = attachedCustomer?.name || WALK_IN_CUSTOMER_LABEL;
  const staffFirstName = (activeRegister?.assigned_staff_name || cashierName || "Staff")
    .split(/\s+/)[0];
  const shiftStatusLabel = sessionLoading
    ? "Shift…"
    : openSession
      ? "Shift open"
      : needsShift
        ? "Shift closed"
        : "Shift";
  const tillChoiceLocked =
    posOnlyStaff && registers.filter((row) => (row.status || "active") === "active").length <= 1;

  const startNewSale = () => {
    setCompletedSale(null);
    setSaleAudit([]);
    setPayMethodOpen(false);
    setCashOpen(false);
    setCardOpen(false);
    setDigitalOpen(false);
    searchRef.current?.focus();
  };

  const closePayStage = () => {
    setPayMethodOpen(false);
    setCashOpen(false);
    setCardOpen(false);
    setDigitalOpen(false);
  };

  const handlePosLogout = async () => {
    const hadPosPass = Boolean(getPosAccessToken());
    try {
      if (hadPosPass) await endPosAccess();
      else await logout();
    } finally {
      navigate(hadPosPass || posOnlyStaff ? posAccessPath() : `${createPageUrl("Login")}#sign-in`, {
        replace: true,
      });
    }
  };

  const moneyRows = [
    { label: "Subtotal", amount: totals.subtotal },
    { label: "Discount", amount: totals.discount_amount, action: cart.length > 0 && canDiscount ? "discount" : null },
    { label: "Tax", amount: totals.tax_amount },
  ];

  if (tillGateError) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Store className="size-10 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-display text-xl font-semibold">Till not available</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{tillGateError}</p>
        </div>
        <Button type="button" className="h-12" onClick={() => navigate(createPageUrl("POS"))}>
          Open Paidly POS
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:h-16 sm:gap-3 sm:px-5">
        {posOnlyStaff ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 touch-manipulation text-muted-foreground"
            aria-label="Sign out"
            onClick={() => void handlePosLogout()}
          >
            <LogOut className="size-4" />
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" asChild>
            <Link to={createPageUrl("Dashboard")} aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            {businessLogoUrl ? (
              businessLogoUrl.startsWith("blob:") ? (
                <img src={businessLogoUrl} alt="" className="size-8 shrink-0 rounded-md object-contain" />
              ) : (
                <LogoImage src={businessLogoUrl} alt="" className="size-8 shrink-0 rounded-md object-contain" preflightStorage />
              )
            ) : null}
            <h1 className="font-display text-base font-semibold leading-none tracking-tight">Paidly POS</h1>
          </div>
          <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">
            {staffFirstName}
          </p>
        </div>
        <button
          type="button"
          className="hidden min-h-11 min-w-0 max-w-[12rem] truncate rounded-input px-2 py-1 text-left text-sm font-medium hover:bg-muted sm:block"
          onClick={() => {
            if (!tillChoiceLocked) setRegisterOpen(true);
          }}
        >
          <span className="block truncate">{activeRegister?.name || "Main Till"}</span>
          <span className="block text-[11px] font-normal text-muted-foreground">{tillBrandName}</span>
        </button>
        <div className="hidden items-center gap-2 md:flex">
          <PosConnectivityBar state={connectivityState} />
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              openSession
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "border-border bg-muted text-muted-foreground"
            )}
          >
            {shiftStatusLabel}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            className="hidden min-h-11 rounded-input px-2 text-right sm:block"
            onClick={() => {
              setTodayOpen(true);
              void loadToday();
            }}
          >
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Today</span>
            <span className="block text-sm font-semibold tabular-nums">{formatCurrency(todayTotal, currency)}</span>
          </button>
          {openSession && canCloseRegister ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11 touch-manipulation px-3"
              onClick={() => void openCloseShift()}
            >
              Close shift
            </Button>
          ) : needsShift ? (
            <Button
              type="button"
              className="h-11 min-h-11 touch-manipulation px-3"
              onClick={() => {
                setOpeningDraft(String(activeRegister?.opening_balance ?? 0));
                setStartShiftOpen(true);
              }}
            >
              Open shift
            </Button>
          ) : (
            <Button type="button" variant="outline" className="h-11 min-h-11 px-3" disabled>
              {shiftStatusLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:hidden"
            onClick={() => {
              if (!tillChoiceLocked) setRegisterOpen(true);
            }}
            aria-label={`Till ${activeRegister?.name || "Main Till"}`}
          >
            <Store className="size-4" />
          </Button>
          {canInvitePosStaff ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 min-h-11 px-2 text-muted-foreground sm:px-3"
              onClick={() => setStaffManageOpen(true)}
              aria-label="Staff"
            >
              <UserPlus className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Staff</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-h-11 px-2 text-muted-foreground sm:px-3"
            onClick={() => {
              setTodayOpen(true);
              void loadToday();
            }}
            aria-label="Orders"
          >
            <Receipt className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Orders</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label="Help"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5 md:hidden">
        <button
          type="button"
          className="min-h-11 min-w-0 truncate text-left text-xs font-medium"
          onClick={() => {
            if (!tillChoiceLocked) setRegisterOpen(true);
          }}
        >
          {activeRegister?.name || "Main Till"}
          <span className="text-muted-foreground"> · {staffFirstName}</span>
        </button>
        <PosConnectivityBar state={connectivityState} className="ml-auto shrink-0" />
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium",
            openSession
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          {shiftStatusLabel}
        </span>
        <button
          type="button"
          className="min-h-11 shrink-0 text-xs font-semibold tabular-nums"
          onClick={() => {
            setTodayOpen(true);
            void loadToday();
          }}
        >
          {formatCurrency(todayTotal, currency)}
        </button>
      </div>
      {blockedReason ? (
        <div
          className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-950 dark:text-amber-100 sm:text-sm"
          role="status"
        >
          {blockedReason} You can still build a cart; hold stays on this device only.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 px-3 py-2 sm:px-3">
            <div className="flex gap-1.5">
              <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={query}
                    onChange={handleSearchChange}
                    placeholder="Search products or scan barcode"
                    className="h-11 min-h-11 pl-10 pr-11 text-sm sm:text-base"
                    autoComplete="off"
                    inputMode="search"
                    enterKeyHint="go"
                    aria-label="Search products or scan barcode"
                    onPaste={handleSearchPaste}
                  />
                  {query ? (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-input text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        setQuery("");
                        focusScanner();
                      }}
                      aria-label="Clear search"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              </form>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 shrink-0 touch-manipulation px-3"
                onClick={() => setScannerOpen(true)}
                aria-label="Scan barcode with camera"
                title="Scan barcode"
              >
                <ScanBarcode className="size-4 sm:mr-1.5" />
                Scan
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  "min-h-4 truncate text-[11px] font-medium",
                  scanStatus?.tone === "error"
                    ? "text-destructive"
                    : scanStatus?.tone === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                )}
                role="status"
              >
                {scanStatus?.text || (scanMode ? "Ready to scan" : "Search products")}
              </p>
              <button
                type="button"
                className={cn(
                  "h-8 shrink-0 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide",
                  scanMode ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
                onClick={() => {
                  setScanMode((on) => !on);
                  focusScanner();
                }}
                aria-pressed={scanMode}
              >
                {scanMode ? "Scan mode: ON" : "Scan mode: Off"}
              </button>
            </div>

            <div
              className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Product categories"
            >
              <button
                type="button"
                role="tab"
                aria-selected={category === "all"}
                onClick={() => {
                  triggerHaptic(8);
                  setCategory("all");
                }}
                className={cn(
                  "h-11 min-h-11 shrink-0 rounded-md px-3 text-sm font-medium touch-manipulation",
                  category === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === "popular"}
                onClick={() => {
                  triggerHaptic(8);
                  setCategory("popular");
                }}
                className={cn(
                  "h-11 min-h-11 shrink-0 rounded-md px-3 text-sm font-medium touch-manipulation",
                  category === "popular" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                Popular
              </button>
              {categories.map((row) => {
                const selected = category === row.name;
                return (
                  <button
                    key={row.name}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      triggerHaptic(8);
                      setCategory(row.name);
                    }}
                    className={cn(
                      "h-11 min-h-11 shrink-0 rounded-md px-3 text-sm font-medium touch-manipulation",
                      selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}
                  >
                    {row.name}
                  </button>
                );
              })}
            </div>
          </div>

          {catalogLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-6 animate-spin" /> Loading products
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="text-lg font-semibold">
                {category !== "all" || query.trim() ? "No products in this view" : "No products to sell"}
              </p>
              <p className="text-sm text-muted-foreground">
                {category !== "all" && category !== "popular"
                  ? `Nothing in ${category}${query.trim() ? " matches this search" : ""}.`
                  : category === "popular"
                    ? "No popular items yet. Complete a few sales today and they will show here."
                    : query.trim()
                    ? "Try a different name, SKU, or barcode."
                    : "Add physical products with stock in the catalog. Private brand products only appear on that brand’s till."}
              </p>
              {category !== "all" || query.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    setCategory("all");
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  Show all products
                </Button>
              ) : posOnlyStaff ? null : (
                <Button asChild className="h-12">
                  <Link to={createPageUrl("Services")}>Open catalog</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 lg:pb-3">
              <div className="grid grid-cols-2 gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                {filteredProducts.map((product) => (
                  <PosCatalogProductCard
                    key={product.id}
                    product={product}
                    currency={currency}
                    inCart={cart.find((line) => line.product_id === product.id)}
                    onAdd={addProduct}
                    onQty={setQty}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 w-[22rem] shrink-0 flex-col border-l border-border bg-card xl:w-[26rem] lg:flex">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                Cart
                {cartCount > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium normal-case tabular-nums tracking-normal text-muted-foreground">
                    {cartCount}
                  </span>
                ) : null}
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                {orgId && heldCart && cart.length === 0 ? (
                  <Button type="button" variant="ghost" className="h-11 px-2 text-xs" onClick={resumeHeldCart}>
                    <Play className="size-3.5" />
                    Resume
                  </Button>
                ) : null}
                {orgId && cart.length > 0 ? (
                  <Button type="button" variant="ghost" className="h-11 px-2 text-xs" onClick={holdCart}>
                    <Pause className="size-3.5" />
                    Hold
                  </Button>
                ) : null}
                {cart.length > 0 ? (
                  <Button type="button" variant="ghost" className="h-11 px-2 text-xs" onClick={clearCart}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CartLineList cart={cart} currency={currency} onQty={setQty} />
            </div>
          </section>

          <section className="shrink-0 border-t border-border p-4">
            <button
              type="button"
              className="mb-4 flex min-h-11 w-full flex-col items-start gap-0.5 text-left"
              onClick={() => setCustomerOpen(true)}
            >
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Customer</span>
              <span className="truncate font-medium">{customerLabel}</span>
            </button>
            <dl className="space-y-2 text-sm">
              {moneyRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="tabular-nums">
                    {row.action === "discount" ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-input px-1 font-medium underline-offset-2 hover:underline"
                        onClick={() => {
                          setDiscountDraft(String(totals.discount_amount || 0));
                          setDiscountOpen(true);
                        }}
                      >
                        {formatCurrency(row.amount, currency)}
                      </button>
                    ) : (
                      formatCurrency(row.amount, currency)
                    )}
                  </dd>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wider">Total</dt>
                <dd className="font-display text-3xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(cartTotal, currency)}
                </dd>
              </div>
            </dl>
            <Button
              type="button"
              className="mt-4 h-14 min-h-11 w-full text-base font-semibold uppercase tracking-wide touch-manipulation"
              disabled={
                submitting ||
                sessionLoading ||
                !serverWriteAllowed ||
                (!needsShift && (cart.length === 0 || !canSell))
              }
              onClick={openPay}
            >
              {submitting || sessionLoading ? <Loader2 className="size-5 animate-spin" /> : null}
              {!serverWriteAllowed
                ? connectivityState === "reconnecting"
                  ? "Reconnecting…"
                  : "Offline"
                : needsShift
                  ? "Open shift"
                  : canSell
                    ? `Pay ${formatCurrency(cartTotal, currency)}`
                    : "No sell access"}
            </Button>
          </section>
        </aside>
      </div>

      {cartCount > 0 || (orgId && heldCart) ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            className="pointer-events-auto flex min-h-11 w-full flex-col gap-0.5 rounded-md bg-primary px-4 py-2 text-primary-foreground shadow-sm touch-manipulation"
            onClick={() => {
              if (orgId && heldCart && cart.length === 0) {
                resumeHeldCart();
                return;
              }
              setCartSheetOpen(true);
            }}
          >
            {cart.length === 0 && heldCart ? (
              <span className="text-center text-sm font-semibold uppercase tracking-wide">Resume held sale</span>
            ) : (
              <>
                <span className="flex items-center justify-between gap-3 text-sm font-semibold uppercase tracking-wide">
                  <span>
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                  </span>
                  <span className="tabular-nums">{formatCurrency(cartTotal, currency)}</span>
                </span>
                <span className="text-center text-xs font-bold uppercase tracking-wide">View cart</span>
              </>
            )}
          </button>
        </div>
      ) : null}

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        title="Scan Barcode"
        continuous={cameraContinuous}
        onContinuousChange={setCameraContinuous}
        onDetected={(code) => applyScannedCode(code, { keepScanner: cameraContinuous })}
      />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Till help</DialogTitle>
            <DialogDescription>Sell, take payment, receipt, next sale.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>USB or Bluetooth scanners type into search and add on Enter. Camera Scan requests permission only when you open it.</li>
            <li>Search or scan to add products. Out of stock items cannot be sold.</li>
            <li>Walk-in Customer is the default. Attach a POS customer only when you need a name.</li>
            <li>Cash is counted on this till. Card and EFT wait for the real payment rail.</li>
            <li>Stock decreases only after a sale is paid — not when you add to the cart.</li>
          </ul>
          {posOnlyStaff ? null : (
            <Button type="button" variant="outline" className="h-11 min-h-11 w-full" asChild>
              <Link to={`${createPageUrl("Settings")}?tab=integrations`}>POS settings</Link>
            </Button>
          )}
          <Button type="button" className="h-11 min-h-11 w-full" asChild>
            <a href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL || "support@paidly.co.za"}`}>Contact support</a>
          </Button>
        </DialogContent>
      </Dialog>

      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Cart</SheetTitle>
            <SheetDescription>{cartCount} items</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CartLineList cart={cart} currency={currency} onQty={setQty} />
          </div>
          {cart.length > 0 || (orgId && heldCart) ? (
            <div className="space-y-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setCustomerOpen(true)}
              >
                <span className="text-sm text-muted-foreground">POS Customer</span>
                <span className="truncate font-medium">{customerLabel}</span>
              </button>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-display text-xl font-bold tabular-nums">
                  {formatCurrency(cartTotal, currency)}
                </span>
              </div>
              {orgId && heldCart && cart.length === 0 ? (
                <Button type="button" variant="outline" className="h-11 w-full" onClick={resumeHeldCart}>
                  <Play className="size-4" />
                  Resume held sale
                </Button>
              ) : null}
              {orgId && cart.length > 0 ? (
                <Button type="button" variant="outline" className="h-11 w-full" onClick={holdCart}>
                  <Pause className="size-4" />
                  Hold on this device
                </Button>
              ) : null}
              {cart.length > 0 ? (
                <Button
                  type="button"
                  className="h-14 w-full text-base font-semibold"
                  disabled={submitting || sessionLoading || !serverWriteAllowed || !canSell}
                  onClick={() => {
                    setCartSheetOpen(false);
                    openPay();
                  }}
                >
                  {needsShift ? "Start shift" : `Pay ${formatCurrency(cartTotal, currency)}`}
                </Button>
              ) : null}
              {cart.length > 0 ? (
                <Button type="button" variant="ghost" className="h-11 w-full" onClick={clearCart}>
                  Clear cart
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={discountOpen}
        onOpenChange={(open) => {
          setDiscountOpen(open);
          if (open) setDiscountDraft(String(totals.discount_amount || 0));
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Discount</DialogTitle>
            <DialogDescription>
              Cart-level amount, same as invoices: total is subtotal minus discount. Cannot exceed{" "}
              {formatCurrency(subtotal, currency)}. Listed prices stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            min={0}
            max={subtotal}
            step="0.01"
            value={discountDraft}
            onChange={(e) => setDiscountDraft(e.target.value)}
            className="h-14 text-center text-2xl font-bold tabular-nums"
            aria-label="Discount amount"
            inputMode="decimal"
          />
          <DialogFooter className="gap-2 sm:justify-stretch">
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() => {
                setDiscountAmount(0);
                setDiscountOpen(false);
              }}
            >
              Remove
            </Button>
            <Button type="button" className="h-12 flex-1" onClick={applyDiscountDraft}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={payMethodOpen}
        onOpenChange={setPayMethodOpen}
      >
        <DialogContent className="max-w-md gap-5 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Payment</DialogTitle>
            <DialogDescription>
              {customerLabel} · {cartCount} items
            </DialogDescription>
          </DialogHeader>
          <p className="font-display text-4xl font-bold tabular-nums tracking-tight">
            {formatCurrency(cartTotal, currency)}
          </p>
          <div className="grid grid-cols-1 gap-2">
            <Button type="button" className="h-14 min-h-11 text-base font-semibold uppercase tracking-wide touch-manipulation" disabled={!checkoutAllowed} onClick={openCash}>
              <Banknote className="size-5" />
              Cash
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-14 min-h-11 text-base font-semibold uppercase tracking-wide touch-manipulation"
              disabled={!checkoutAllowed}
              onClick={openCard}
            >
              <CreditCard className="size-5" />
              Card
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-14 min-h-11 text-base font-semibold uppercase tracking-wide touch-manipulation"
              disabled={submitting || !checkoutAllowed}
              onClick={openDigital}
            >
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <Smartphone className="size-5" />}
              EFT / Digital
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cash is counted on this till. Card and EFT complete only after the real payment rail confirms — this
            screen never marks a sale paid on tap.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cardOpen}
        onOpenChange={setCardOpen}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Card</DialogTitle>
            <DialogDescription>Waiting for card payment confirmation.</DialogDescription>
          </DialogHeader>
          <p className="font-display text-4xl font-bold tabular-nums">{formatCurrency(cartTotal, currency)}</p>
          <p className="text-sm text-muted-foreground">
            This till does not mark a card sale paid on tap. Connect a reader (Yoco / Square) in back-office
            Integrations. The order stays unpaid until that rail confirms.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {posOnlyStaff ? null : (
              <Button type="button" className="h-12 min-h-11 w-full" asChild>
                <Link to={`${createPageUrl("Settings")}?tab=integrations`}>POS settings</Link>
              </Button>
            )}
            <Button type="button" variant="ghost" className="h-12 min-h-11 w-full" onClick={closePayStage}>
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={digitalOpen}
        onOpenChange={setDigitalOpen}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Digital Payment</DialogTitle>
            <DialogDescription>
              Ozow confirms this sale. Tapping Continue does not mark it paid unless Ozow succeeds.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            There is no trusted click-to-paid digital workflow. If Ozow is not configured, the cart stays unpaid.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="h-12 w-full"
              disabled={submitting || !checkoutAllowed}
              onClick={() => void completeCheckout({ paymentMethod: "digital" })}
            >
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <Smartphone className="size-5" />}
              Request Ozow payment
            </Button>
            <Button type="button" variant="ghost" className="h-12 min-h-11 w-full" onClick={closePayStage}>
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cashOpen}
        onOpenChange={setCashOpen}
      >
        <DialogContent className="max-w-md gap-4 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Cash</DialogTitle>
            <DialogDescription>Counted on the till. Not sent to Ozow or PayFast.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Amount due</span>
              <span className="font-semibold tabular-nums">{formatCurrency(cartTotal, currency)}</span>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Cash received</p>
              <p className="font-display text-3xl font-bold tabular-nums">{formatCurrency(Number(tendered) || 0, currency)}</p>
            </div>
            <PosCashKeypad value={tendered} onChange={setTendered} />
            <div className="grid grid-cols-3 gap-2">
              {tenderChips.slice(0, 3).map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={roundMoney(Number(tendered)) === amount ? "default" : "outline"}
                  className="h-11 min-h-11 touch-manipulation tabular-nums"
                  onClick={() => setTendered(String(amount.toFixed(2)))}
                >
                  {amount === cartTotal ? "Exact" : formatCurrency(amount, currency)}
                </Button>
              ))}
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Change</span>
              <span className="font-display text-3xl font-bold tabular-nums">
                {formatCurrency(cashTender.ok ? cashTender.changeDue : 0, currency)}
              </span>
            </div>
          </div>
          <DialogFooter className="sm:justify-stretch">
            <Button
              type="button"
              className="h-14 min-h-11 w-full text-base font-semibold uppercase tracking-wide touch-manipulation"
              disabled={submitting || !cashTender.ok || !checkoutAllowed}
              onClick={() => void completeCheckout({ paymentMethod: "cash", amountTendered: tendered })}
            >
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              Complete payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(completedSale)}
        onOpenChange={(open) => {
          if (!open) startNewSale();
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {completedSale?.sale_kind === "return" ? "Return complete" : "Payment successful"}
            </DialogTitle>
            <DialogDescription>
              {completedSale?.receipt_number || "Order"} · {customerLabel}
            </DialogDescription>
          </DialogHeader>
          <p className="font-display text-4xl font-bold tabular-nums">
            {formatCurrency(Math.abs(Number(completedSale?.total_amount) || 0), completedSale?.currency || currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {completedSale?.receipt_number ? `Order ${completedSale.receipt_number}` : null}
            {completedSale?.cashier_name ? ` · ${completedSale.cashier_name}` : null}
          </p>
          {completedSale?.payment_method === "cash" && completedSale?.amount_tendered != null ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Cash received</dt>
                <dd className="tabular-nums">{formatCurrency(completedSale.amount_tendered, currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Change</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatCurrency(Number(completedSale.change_due) || 0, currency)}
                </dd>
              </div>
            </dl>
          ) : completedSale?.change_due != null ? (
            <p className="text-lg">
              Change <span className="font-semibold">{formatCurrency(completedSale.change_due, currency)}</span>
            </p>
          ) : null}
          {saleAudit.length > 0 ? (
            <ol className="space-y-1.5 border-t pt-3 text-sm">
              {saleAudit.map((event) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3">
                  <span>{event.label}</span>
                  {event.occurred_at ? (
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {format(new Date(event.occurred_at), "HH:mm")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Send receipt</p>
            <Input
              type="email"
              value={receiptEmailTo}
              onChange={(e) => setReceiptEmailTo(e.target.value)}
              placeholder="customer@email"
              className="h-12 min-h-11"
              autoComplete="email"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="button" className="h-14 min-h-11 w-full text-base font-semibold" onClick={startNewSale}>
              New sale
            </Button>
            <Button type="button" variant="outline" className="h-12 min-h-11 w-full" onClick={printCurrentReceipt}>
              <Printer className="size-4" /> Print receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 min-h-11 w-full"
              disabled={receiptBusy === "download"}
              onClick={() => void downloadCurrentReceipt()}
            >
              {receiptBusy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 min-h-11 w-full"
              disabled={receiptBusy === "email"}
              onClick={() => void emailCurrentReceipt()}
            >
              {receiptBusy === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Send receipt
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 min-h-11 w-full"
              onClick={() => {
                setTodayOpen(true);
                void loadToday();
              }}
            >
              <Receipt className="size-4" /> View order
            </Button>
            {(completedSale?.sale_kind || "sale") === "sale" && !posOnlyStaff ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 min-h-11 w-full"
                disabled={convertBusy}
                onClick={() => void convertSaleToInvoice(completedSale)}
              >
                {convertBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {completedSale?.invoice_id ? "View invoice" : "Customer requests invoice"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PosCustomerDialog
        open={customerOpen}
        onOpenChange={(open) => {
          setCustomerOpen(open);
          if (!open) setInvoiceClientPick(false);
        }}
        orgId={orgId}
        selectedId={clientId}
        allowWalkIn={!invoiceClientPick}
        onSelectWalkIn={() => {
          setClientId("");
          setClientQuery("");
          setAttachedCustomer(null);
        }}
        onSelectClient={(client) => {
          setClientId(client.id);
          setClientQuery(client.name || "");
          setAttachedCustomer(client);
          if (invoiceClientPick && completedSale?.id) {
            void convertSaleToInvoice(completedSale, client.id);
          }
        }}
        onCreated={(created) => {
          invalidateClientDomain(queryClient, { scopeKey: user?.id || null, skipInvoiceCascade: true });
          toast({ title: "POS customer saved", description: created.name });
        }}
      />

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Register</DialogTitle>
            <DialogDescription>
              Choose the till for this device. Products follow this register’s brand — private items from another brand will not appear.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto">
            {registers.filter((row) => (row.status || "active") === "active").length === 0 ? (
              <li className="rounded-xl border border-border px-3 py-4 text-sm text-muted-foreground">
                {posOnlyStaff
                  ? "No active till is assigned yet. Ask a manager to add a register."
                  : "No active register yet. Add one in Settings → Integrations after running the POS registers migration."}
              </li>
            ) : null}
            {registers.filter((row) => (row.status || "active") === "active").map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col rounded-xl border border-border px-3 py-3 text-left hover:bg-muted",
                    activeRegister?.id === row.id ? "bg-muted/60" : ""
                  )}
                  onClick={() => {
                    if (
                      posOnlyStaff &&
                      companyCtx?.posRegisterId &&
                      row.id !== companyCtx.posRegisterId
                    ) {
                      return;
                    }
                    setActiveRegister(row);
                    if (orgId) writeActiveRegisterId(orgId, row.id);
                    setRegisterOpen(false);
                  }}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    <span className="truncate">{row.name}</span>
                    {activeRegister?.id === row.id ? <Check className="size-4 shrink-0" /> : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.company_name || "Shared catalog"}
                    {" · "}
                    {row.assigned_staff_name || cashierName || "Unassigned"}
                    {" · Float "}
                    {formatCurrency(Number(row.opening_balance) || 0, currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog
        open={startShiftOpen}
        onOpenChange={(open) => {
          if (open) setOpeningDraft(String(activeRegister?.opening_balance ?? 0));
          setStartShiftOpen(open);
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Start shift</DialogTitle>
            <DialogDescription>
              Count opening cash into {activeRegister?.name || "this till"} before sales. Card payments do
              not change expected drawer cash.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pos-opening-cash">Opening cash</Label>
            <Input
              id="pos-opening-cash"
              inputMode="decimal"
              value={openingDraft}
              onChange={(e) => setOpeningDraft(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setStartShiftOpen(false)}>
              Later
            </Button>
            <Button
              type="button"
              disabled={shiftBusy || Number(openingDraft) < 0 || openingDraft === "" || !serverWriteAllowed}
              onClick={() => void startShift()}
            >
              {shiftBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Open drawer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
            <DialogDescription>
              Count the drawer. This session becomes history and cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Opening</dt>
              <dd className="tabular-nums">{formatCurrency(Number(openSession?.opening_balance) || 0, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cash sales</dt>
              <dd className="tabular-nums">{formatCurrency(Number(openSession?.cash_sales) || 0, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cash refunds</dt>
              <dd className="tabular-nums">{formatCurrency(Number(openSession?.cash_refunds) || 0, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Card / EFT (not drawer)</dt>
              <dd className="tabular-nums">
                {formatCurrency(
                  todaySales
                    .filter(
                      (row) =>
                        (row.sale_kind || "sale") !== "return" &&
                        row.payment_method &&
                        row.payment_method !== "cash" &&
                        (!openSession?.id || row.session_id === openSession.id)
                    )
                    .reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0),
                  currency
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 font-medium">
              <dt>Expected cash</dt>
              <dd className="tabular-nums">{formatCurrency(Number(openSession?.expected_cash) || 0, currency)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <Label htmlFor="pos-closing-cash">Closing cash counted</Label>
            <Input
              id="pos-closing-cash"
              inputMode="decimal"
              value={closingDraft}
              onChange={(e) => setClosingDraft(e.target.value)}
            />
          </div>
          {closePreviewVariance != null ? (
            <p
              className={
                closePreviewVariance === 0
                  ? "text-sm text-emerald-600"
                  : closePreviewVariance > 0
                    ? "text-sm text-amber-700"
                    : "text-sm text-destructive"
              }
            >
              Variance {formatCurrency(closePreviewVariance, currency)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCloseShiftOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={shiftBusy || closingDraft === "" || Number(closingDraft) < 0 || !serverWriteAllowed}
              onClick={() => void confirmCloseShift()}
            >
              {shiftBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Close and lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {receiptView ? (
        <div className="pointer-events-none fixed -left-[120vw] top-0 w-[210mm] bg-white" aria-hidden>
          <div ref={receiptPdfRef}>
            <PosReceiptSheet view={receiptView} />
          </div>
        </div>
      ) : null}

      <Sheet open={todayOpen} onOpenChange={setTodayOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Orders</SheetTitle>
            <SheetDescription>
              {formatCurrency(todayTotal, currency)} today · this till’s authorised sales
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto pb-8">
            {todayLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : todaySales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet today.</p>
            ) : (
              todaySales.map((sale) => (
                <div key={sale.id} className="rounded-xl border border-border p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left touch-manipulation"
                    onClick={() => {
                      setCompletedSale(sale);
                      setReceiptEmailTo(sale.customer_email || sale.raw_payload?.customer_email || "");
                      setTodayOpen(false);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {sale.receipt_number || sale.external_id}
                        {sale.sale_kind === "return" ? " · Return" : ""}
                        {sale.refund_status === "partial" ? " · Partial return" : ""}
                        {sale.refund_status === "full" ? " · Returned" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sale.occurred_at ? format(new Date(sale.occurred_at), "HH:mm") : ""}
                        {" · "}
                        {sale.cashier_name || staffFirstName}
                        {" · "}
                        {sale.customer_name || WALK_IN_CUSTOMER_LABEL}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(Array.isArray(sale.items) ? sale.items.reduce((n, line) => n + (Number(line.quantity) || 0), 0) : 0)}{" "}
                        items · {sale.payment_method || "POS"}
                      </p>
                    </div>
                    <span className="text-base font-semibold tabular-nums">
                      {formatCurrency(Number(sale.total_amount) || 0, sale.currency || currency)}
                    </span>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => {
                        setCompletedSale(sale);
                        setReceiptEmailTo(sale.customer_email || sale.raw_payload?.customer_email || "");
                        setTodayOpen(false);
                      }}
                    >
                      Receipt
                    </Button>
                    {(sale.sale_kind || "sale") === "sale" && canRefund && sale.refund_status !== "full" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => openReturnDialog(sale)}
                      >
                        <RotateCcw className="size-4" /> Return
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(returnSale)}
        onOpenChange={(open) => {
          if (!open) {
            setReturnSale(null);
            setReturnQtys({});
            setRefundAsCash(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return items</DialogTitle>
            <DialogDescription>
              Restock selected lines from {returnSale?.receipt_number || "this sale"}. The original sale stays on
              the ledger.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {returnLines.map((line) => {
              const qty = Math.min(
                Math.max(0, Math.trunc(Number(returnQtys[line.product_id]) || 0)),
                line.remaining
              );
              return (
                <li key={line.product_id} className="flex items-center gap-2 rounded-xl border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(line.unit_price, currency)} · {line.remaining} left of {line.sold_quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-11 min-h-11 min-w-11 touch-manipulation"
                      onClick={() =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [line.product_id]: Math.max(0, qty - 1),
                        }))
                      }
                      aria-label={`Decrease return quantity for ${line.name}`}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-11 min-h-11 min-w-11 touch-manipulation"
                      onClick={() =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [line.product_id]: Math.min(line.remaining, qty + 1),
                        }))
                      }
                      aria-label={`Increase return quantity for ${line.name}`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {returnSale && (returnSale.payment_method || "cash") !== "cash" ? (
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <Checkbox
                className="mt-0.5 size-5"
                checked={refundAsCash}
                onCheckedChange={(checked) => setRefundAsCash(checked === true)}
              />
              <span>
                Refund as cash from the drawer
                <span className="mt-1 block text-xs text-muted-foreground">
                  Card and digital money-back is not wired yet. Leave unchecked to restock only and mark the
                  refund as pending.
                </span>
              </span>
            </label>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {returnRail === "till_cash"
              ? `Cash refund ${formatCurrency(returnTotal, currency)} leaves the drawer.`
              : `Goods come back. ${formatCurrency(returnTotal, currency)} stays pending until a provider refund exists.`}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => {
                setReturnSale(null);
                setReturnQtys({});
                setRefundAsCash(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-12"
              disabled={submitting || returnTotal <= 0 || !serverWriteAllowed}
              onClick={() => void submitReturn(returnSale)}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PosTillStaffSheet
        open={staffManageOpen}
        onOpenChange={setStaffManageOpen}
        companyCtx={companyCtx}
        onInvite={() => {
          setStaffManageOpen(false);
          setInviteOpen(true);
        }}
      />
      <PosStaffInviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        defaultRegisterId={activeRegister?.id || ""}
      />
    </div>
  );
}
