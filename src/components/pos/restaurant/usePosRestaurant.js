import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_TYPE, defaultOrderType, restaurantModeEnabled } from "@shared/pos/restaurant.js";
import { fetchRestaurantFloor, fetchTab, tabAction } from "@/services/PosRestaurantService";
import { fetchPosPaymentIntent } from "@/services/PosIntegrationService";

export const RESTAURANT_VIEW = Object.freeze({ FLOOR: "floor", MENU: "menu", KITCHEN: "kitchen", ORDERS: "orders" });
const TAB_PAYMENT_KEY = "paidly_pos_tab_payment";
const FLOOR_POLL_MS = 15000;

/**
 * Restaurant-mode state for the till: floor plan, the table order being edited (a "tab"), order
 * type and view. The till's cart is reused as the tab's NEW ITEMS buffer.
 */
export function usePosRestaurant({ businessType, registerId, cashierName, cart, setCart, toast, searchParams, setSearchParams }) {
  const [floorState, setFloorState] = useState(null);
  const [floorLoading, setFloorLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [orderType, setOrderTypeState] = useState(null);
  const [view, setView] = useState(RESTAURANT_VIEW.FLOOR);
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState("");
  const bundleIdRef = useRef(null);
  bundleIdRef.current = bundle?.tab?.id || null;

  const tableCount = floorState?.tables?.length || 0;
  const enabled = !schemaMissing && restaurantModeEnabled({ businessType, tableCount });
  const effectiveOrderType = enabled ? orderType || defaultOrderType({ businessType, tableCount }) : ORDER_TYPE.COUNTER;

  const refreshFloor = useCallback(async () => {
    try {
      const next = await fetchRestaurantFloor();
      setFloorState(next);
      setSchemaMissing(false);
      return next;
    } catch (err) {
      if (err?.code === "RESTAURANT_SCHEMA_MISSING") setSchemaMissing(true);
      return null;
    } finally {
      setFloorLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFloor();
  }, [refreshFloor]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshFloor();
    }, FLOOR_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refreshFloor]);

  const applyBundle = useCallback((next) => {
    setBundle(next?.tab ? next : null);
    return next;
  }, []);

  const openTab = useCallback(
    async (tabId, { toMenu = true } = {}) => {
      setBusy("open");
      try {
        const next = applyBundle(await fetchTab(tabId));
        setOrderTypeState(next?.tab?.order_type === ORDER_TYPE.TAKEAWAY ? ORDER_TYPE.TAKEAWAY : ORDER_TYPE.DINE_IN);
        if (toMenu) setView(RESTAURANT_VIEW.MENU);
        return next;
      } catch (err) {
        toast({ title: "Could not open the order", description: err?.message, variant: "destructive" });
        return null;
      } finally {
        setBusy("");
      }
    },
    [applyBundle, toast]
  );

  const leaveTab = useCallback(() => {
    setBundle(null);
    setView(RESTAURANT_VIEW.FLOOR);
    void refreshFloor();
  }, [refreshFloor]);

  const setOrderType = useCallback(
    (next) => {
      setOrderTypeState(next);
      setBundle(null);
      setView(next === ORDER_TYPE.DINE_IN ? RESTAURANT_VIEW.FLOOR : RESTAURANT_VIEW.MENU);
    },
    []
  );

  const cartItems = useCallback(
    () => cart.map((line) => ({ product_id: line.product_id, quantity: line.quantity, note: line.note || undefined })),
    [cart]
  );

  const seatTable = useCallback(
    async (table, guests) => {
      try {
        const next = applyBundle(
          await tabAction("open", { table_id: table.id, guests, order_type: ORDER_TYPE.DINE_IN, register_id: registerId || undefined, server_name: cashierName || undefined })
        );
        setOrderTypeState(ORDER_TYPE.DINE_IN);
        setView(RESTAURANT_VIEW.MENU);
        void refreshFloor();
        return next;
      } catch (err) {
        if (err?.code === "TABLE_OCCUPIED") {
          await refreshFloor();
        }
        toast({ title: "Table not opened", description: err?.message, variant: "destructive" });
        throw err;
      }
    },
    [applyBundle, cashierName, refreshFloor, registerId, toast]
  );

  /** Persist the cart onto the tab (creating a takeaway tab when needed); optionally send it. */
  const commitCart = useCallback(
    async ({ send }) => {
      const items = cartItems();
      if (!items.length && !(send && bundle?.items?.some((i) => i.status === "pending"))) return null;
      setBusy(send ? "send" : "save");
      try {
        let current = bundle;
        if (!current) {
          if (effectiveOrderType !== ORDER_TYPE.TAKEAWAY) {
            toast({ title: "Choose a table first", description: "Pick a table on the floor plan to start its order." });
            setView(RESTAURANT_VIEW.FLOOR);
            return null;
          }
          current = await tabAction("open", { order_type: ORDER_TYPE.TAKEAWAY, items, register_id: registerId || undefined, server_name: cashierName || undefined });
        } else if (items.length) {
          current = await tabAction("add_items", { tab_id: current.tab.id, items });
        }
        setCart([]);
        if (send) {
          const sent = await tabAction("send", { tab_id: current.tab.id });
          applyBundle(sent);
          const tickets = sent.sent_tickets || [];
          toast({
            title: `Sent to ${tickets.length > 1 ? `${tickets.length} stations` : "the kitchen"}`,
            description: tickets.map((t) => `KOT #${t.ticket_number}`).join(" · "),
            variant: "success",
          });
        } else {
          applyBundle(current);
          toast({ title: "Order saved", description: "Not sent to the kitchen yet." });
        }
        void refreshFloor();
        return current;
      } catch (err) {
        toast({ title: send ? "Not sent to the kitchen" : "Order not saved", description: err?.message, variant: "destructive" });
        return null;
      } finally {
        setBusy("");
      }
    },
    [applyBundle, bundle, cartItems, cashierName, effectiveOrderType, refreshFloor, registerId, setCart, toast]
  );

  const runAction = useCallback(
    async (action, body = {}) => {
      if (!bundle?.tab) return null;
      const next = await tabAction(action, { tab_id: bundle.tab.id, ...body });
      applyBundle(next);
      void refreshFloor();
      return next;
    },
    [applyBundle, bundle, refreshFloor]
  );

  const safeAction = useCallback(
    async (action, body, { success } = {}) => {
      try {
        const next = await runAction(action, body);
        if (success) toast({ title: success, variant: "success" });
        return next;
      } catch (err) {
        toast({ title: "Order not updated", description: err?.message, variant: "destructive" });
        return null;
      }
    },
    [runAction, toast]
  );

  const closeTab = useCallback(async () => {
    const next = await safeAction("close", {}, { success: bundle?.tab?.table_id ? `${bundle.tab.label} closed · marked for cleaning` : "Order closed" });
    if (next) leaveTab();
  }, [bundle, leaveTab, safeAction]);

  const markClean = useCallback(
    async (table) => {
      try {
        await tabAction("mark_clean", { table_id: table.id });
        await refreshFloor();
      } catch (err) {
        toast({ title: "Table not updated", description: err?.message, variant: "destructive" });
      }
    },
    [refreshFloor, toast]
  );

  const reloadTab = useCallback(async () => {
    if (!bundleIdRef.current) return null;
    const next = await fetchTab(bundleIdRef.current).catch(() => null);
    if (next) applyBundle(next);
    void refreshFloor();
    return next;
  }, [applyBundle, refreshFloor]);

  /** Before redirecting to the online provider, remember which tab we were paying. */
  const rememberTabPayment = useCallback((payload) => {
    try {
      sessionStorage.setItem(TAB_PAYMENT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, []);

  // Returning from the provider: /pos?payment=return&intent=…&tab=…
  useEffect(() => {
    const tabId = searchParams.get("tab");
    const intentId = searchParams.get("intent");
    if (searchParams.get("payment") !== "return" || !tabId) return undefined;
    let cancelled = false;
    (async () => {
      await openTab(tabId);
      try {
        const status = intentId ? await fetchPosPaymentIntent(intentId) : null;
        if (cancelled) return;
        const st = status?.payment_intent?.status;
        if (st === "paid") toast({ title: "Payment confirmed", description: "The table's balance is updated.", variant: "success" });
        else if (["failed", "cancelled", "expired"].includes(st) || searchParams.get("result"))
          toast({ title: "Payment not completed", description: "Nothing was charged for this portion. Take payment again.", variant: "destructive" });
        else toast({ title: "Confirming payment", description: "The provider has not confirmed yet — the table updates automatically." });
      } catch {
        /* status is visible on the tab */
      }
      try {
        sessionStorage.removeItem(TAB_PAYMENT_KEY);
      } catch {
        /* ignore */
      }
      const next = new URLSearchParams(searchParams);
      ["payment", "intent", "tab", "result"].forEach((k) => next.delete(k));
      setSearchParams?.(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per return URL
  }, [searchParams.get("tab"), searchParams.get("intent")]);

  return {
    enabled,
    schemaMissing,
    orderType: effectiveOrderType,
    setOrderType,
    view,
    setView,
    floorState,
    floorLoading,
    refreshFloor,
    bundle,
    busy,
    openTab,
    leaveTab,
    seatTable,
    markClean,
    sendNewItems: () => commitCart({ send: true }),
    saveNewItems: () => commitCart({ send: false }),
    runAction,
    safeAction,
    closeTab,
    reloadTab,
    rememberTabPayment,
  };
}
