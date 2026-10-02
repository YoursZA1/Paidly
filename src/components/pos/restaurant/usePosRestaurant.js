import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_TYPE, defaultOrderType, restaurantModeEnabled, serveVerb } from "@shared/pos/restaurant.js";
import { fetchRestaurantFloor, fetchTab, tabAction } from "@/services/PosRestaurantService";
import { fetchPosPaymentIntent } from "@/services/PosIntegrationService";

export const RESTAURANT_VIEW = Object.freeze({ FLOOR: "floor", MENU: "menu", KITCHEN: "kitchen", ORDERS: "orders" });
const TAB_PAYMENT_KEY = "paidly_pos_tab_payment";
const FLOOR_POLL_MS = 15000;

/**
 * Restaurant-mode state for the till: floor plan, the table order being edited (a "tab"), order
 * type and view. The till's cart is reused as the tab's NEW ITEMS buffer.
 */
export function usePosRestaurant({ businessType, registerId, cashierName, cart, setCart, toast, searchParams, setSearchParams, initialView = null }) {
  const [floorState, setFloorState] = useState(null);
  const [floorLoading, setFloorLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [orderType, setOrderTypeState] = useState(null);
  const [view, setView] = useState(() => (Object.values(RESTAURANT_VIEW).includes(initialView) ? initialView : RESTAURANT_VIEW.FLOOR));
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState("");
  // Bumped after every order change made on this till so lists (orders, kitchen) refresh at once.
  const [changeTick, setChangeTick] = useState(0);
  const bumpChanges = useCallback(() => setChangeTick((n) => n + 1), []);
  const bundleIdRef = useRef(null);
  bundleIdRef.current = bundle?.tab?.id || null;

  // Hospitality features follow the business type only (Restaurant / café / bar). Retail and mixed
  // tills never load the floor, kitchen or orders — even if tables were set up earlier.
  const allowed = restaurantModeEnabled({ businessType });
  const enabled = allowed && !schemaMissing;
  const effectiveOrderType = enabled ? orderType || defaultOrderType({ businessType }) : ORDER_TYPE.COUNTER;

  const refreshFloor = useCallback(async () => {
    if (!allowed) {
      setFloorLoading(false);
      return null;
    }
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
  }, [allowed]);

  useEffect(() => {
    void refreshFloor();
  }, [refreshFloor]);

  // Live table status while the floor is on screen (the orders and kitchen views keep their own feed).
  useEffect(() => {
    if (!enabled || view !== RESTAURANT_VIEW.FLOOR) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshFloor();
    }, FLOOR_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFloor();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refreshFloor, view]);

  const applyBundle = useCallback((next) => {
    setBundle(next?.tab ? next : null);
    return next;
  }, []);

  const openTab = useCallback(
    async (tabId, { toMenu = true } = {}) => {
      setBusy("open");
      try {
        const next = applyBundle(await fetchTab(tabId));
        const type = next?.tab?.order_type;
        setOrderTypeState(Object.values(ORDER_TYPE).includes(type) ? type : ORDER_TYPE.DINE_IN);
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

  /** Dine-in goes back to the floor; takeaway and counter back to the menu for the next order. */
  const leaveTab = useCallback(() => {
    setBundle(null);
    setView((current) =>
      current === RESTAURANT_VIEW.ORDERS || current === RESTAURANT_VIEW.KITCHEN
        ? current
        : effectiveOrderType === ORDER_TYPE.DINE_IN
          ? RESTAURANT_VIEW.FLOOR
          : RESTAURANT_VIEW.MENU
    );
    void refreshFloor();
  }, [effectiveOrderType, refreshFloor]);

  /** Order type (top navigation). Orders and Kitchen stay put so the status filters combine with it. */
  const setOrderType = useCallback((next) => {
    setOrderTypeState(next);
    setBundle(null);
    setView((current) => {
      if (current === RESTAURANT_VIEW.ORDERS || current === RESTAURANT_VIEW.KITCHEN) return current;
      return next === ORDER_TYPE.DINE_IN ? RESTAURANT_VIEW.FLOOR : RESTAURANT_VIEW.MENU;
    });
  }, []);

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
        bumpChanges();
        return next;
      } catch (err) {
        if (err?.code === "TABLE_OCCUPIED") {
          await refreshFloor();
        }
        toast({ title: "Table not opened", description: err?.message, variant: "destructive" });
        throw err;
      }
    },
    [applyBundle, bumpChanges, cashierName, refreshFloor, registerId, toast]
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
          if (effectiveOrderType === ORDER_TYPE.DINE_IN) {
            toast({ title: "Choose a table first", description: "Pick a table on the floor plan to start its order." });
            setView(RESTAURANT_VIEW.FLOOR);
            return null;
          }
          // Takeaway and counter orders need no table.
          current = await tabAction("open", { order_type: effectiveOrderType, items, register_id: registerId || undefined, server_name: cashierName || undefined });
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
        bumpChanges();
        return current;
      } catch (err) {
        toast({ title: send ? "Not sent to the kitchen" : "Order not saved", description: err?.message, variant: "destructive" });
        return null;
      } finally {
        setBusy("");
      }
    },
    [applyBundle, bumpChanges, bundle, cartItems, cashierName, effectiveOrderType, refreshFloor, registerId, setCart, toast]
  );

  const runAction = useCallback(
    async (action, body = {}) => {
      if (!bundle?.tab) return null;
      const next = await tabAction(action, { tab_id: bundle.tab.id, ...body });
      applyBundle(next);
      void refreshFloor();
      bumpChanges();
      return next;
    },
    [applyBundle, bumpChanges, bundle, refreshFloor]
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

  /** Close a paid order. Dine-in frees the table (or marks it for cleaning when asked). */
  const closeTab = useCallback(
    async ({ cleaning = false } = {}) => {
      const label = bundle?.tab?.label || "Order";
      const success = bundle?.tab?.table_id ? (cleaning ? `${label} closed · marked for cleaning` : `${label} closed · table available`) : `${label} complete`;
      const next = await safeAction("close", cleaning ? { cleaning: true } : {}, { success });
      if (next) leaveTab();
    },
    [bundle, leaveTab, safeAction]
  );

  /**
   * Served (dine-in) / collected (takeaway, counter): hands over everything the kitchen marked ready.
   * Works for the open order or any order in the lists. A paid takeaway/counter order completes.
   */
  const serveTab = useCallback(
    async (tabId = bundleIdRef.current) => {
      if (!tabId) return null;
      try {
        const next = await tabAction("serve", { tab_id: tabId });
        if (bundleIdRef.current === tabId) {
          if (next?.completed) setBundle(null);
          else applyBundle(next);
        }
        const label = next?.tab?.label || "Order";
        toast({
          title: next?.completed ? `${label} collected · order complete` : `${label} ${serveVerb(next?.tab?.order_type)}`,
          variant: "success",
        });
        void refreshFloor();
        bumpChanges();
        return next;
      } catch (err) {
        toast({ title: "Order not updated", description: err?.message, variant: "destructive" });
        return null;
      }
    },
    [applyBundle, bumpChanges, refreshFloor, toast]
  );

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
    bumpChanges();
    return next;
  }, [applyBundle, bumpChanges, refreshFloor]);

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
    serveTab,
    reloadTab,
    changeTick,
    bumpChanges,
    rememberTabPayment,
  };
}
