/**
 * Paidly POS restaurant mode — pure rules shared by the server and the till.
 *
 *   Floor → Table → Tab (one open tab per table) → rounds of items → kitchen tickets per station
 *   → bill (full or split) → payment intents → sales
 *
 * Money is in rands with cents; every split is exact to the cent (remainders go to the last parts).
 */

export const ORDER_TYPE = Object.freeze({
  DINE_IN: "dine_in",
  TAKEAWAY: "takeaway",
  COUNTER: "counter",
});

export const ORDER_TYPE_OPTIONS = Object.freeze([
  { id: ORDER_TYPE.DINE_IN, label: "Dine-in" },
  { id: ORDER_TYPE.TAKEAWAY, label: "Takeaway" },
  { id: ORDER_TYPE.COUNTER, label: "Counter" },
]);

export const TABLE_STATUS = Object.freeze({
  AVAILABLE: "available",
  SEATED: "seated",
  ORDERING: "ordering",
  KITCHEN: "kitchen",
  READY: "ready",
  BILL_REQUESTED: "bill_requested",
  PAYMENT_PENDING: "payment_pending",
  PAID: "paid",
  CLEANING: "cleaning",
});

export const TABLE_STATUS_META = Object.freeze({
  [TABLE_STATUS.AVAILABLE]: { label: "Available", tone: "free" },
  [TABLE_STATUS.SEATED]: { label: "Seated", tone: "busy" },
  [TABLE_STATUS.ORDERING]: { label: "Ordering", tone: "busy" },
  [TABLE_STATUS.KITCHEN]: { label: "Kitchen", tone: "kitchen" },
  [TABLE_STATUS.READY]: { label: "Ready", tone: "ready" },
  [TABLE_STATUS.BILL_REQUESTED]: { label: "Bill requested", tone: "bill" },
  [TABLE_STATUS.PAYMENT_PENDING]: { label: "Payment pending", tone: "bill" },
  [TABLE_STATUS.PAID]: { label: "Paid", tone: "ready" },
  [TABLE_STATUS.CLEANING]: { label: "Cleaning", tone: "cleaning" },
});

export const KITCHEN_STATUS = Object.freeze({
  NEW: "new",
  PREPARING: "preparing",
  READY: "ready",
  COMPLETED: "completed",
  VOID: "void",
});

/** Allowed kitchen ticket moves (KDS buttons: Accept → Ready → Complete). */
export const KITCHEN_TRANSITIONS = Object.freeze({
  [KITCHEN_STATUS.NEW]: [KITCHEN_STATUS.PREPARING, KITCHEN_STATUS.VOID],
  [KITCHEN_STATUS.PREPARING]: [KITCHEN_STATUS.READY, KITCHEN_STATUS.VOID],
  [KITCHEN_STATUS.READY]: [KITCHEN_STATUS.COMPLETED, KITCHEN_STATUS.PREPARING],
  [KITCHEN_STATUS.COMPLETED]: [],
  [KITCHEN_STATUS.VOID]: [],
});

export function canMoveKitchenTicket(from, to) {
  if (from === to) return true;
  return (KITCHEN_TRANSITIONS[from] || []).includes(to);
}

export const DEFAULT_STATION = "kitchen";

/** Normalize a station name: "  Bar " → "bar"; empty → "kitchen". */
export function normalizeStation(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 40);
  return key || DEFAULT_STATION;
}

export function stationLabel(station) {
  const key = normalizeStation(station);
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const cents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (c) => Math.round(c) / 100;

export function lineTotal(item) {
  return fromCents(cents(item?.unit_price) * (Number(item?.quantity) || 0));
}

function billable(items) {
  return (items || []).filter((item) => item && item.status !== "void");
}

/**
 * Tab money: subtotal of non-void items − discount + service charge (on the discounted subtotal).
 * @returns {{ subtotal: number, discount_amount: number, service_charge: number, total: number }}
 */
export function tabTotals({ items = [], discountAmount = 0, serviceChargeRate = 0 } = {}) {
  const subtotalC = billable(items).reduce((sum, item) => sum + Math.round(cents(item.unit_price) * (Number(item.quantity) || 0)), 0);
  const discountC = Math.min(Math.max(0, cents(discountAmount)), subtotalC);
  const rate = Math.min(100, Math.max(0, Number(serviceChargeRate) || 0));
  const serviceC = Math.round(((subtotalC - discountC) * rate) / 100);
  return {
    subtotal: fromCents(subtotalC),
    discount_amount: fromCents(discountC),
    service_charge: fromCents(serviceC),
    total: fromCents(subtotalC - discountC + serviceC),
  };
}

/**
 * Split an amount into `parts` near-equal portions that add up exactly (to the cent).
 * R100 / 3 → [33.33, 33.33, 33.34].
 */
export function splitEqually(total, parts) {
  const n = Math.max(1, Math.floor(Number(parts) || 1));
  const totalC = Math.max(0, cents(total));
  const base = Math.floor(totalC / n);
  const remainder = totalC - base * n;
  return Array.from({ length: n }, (_, i) => fromCents(base + (i >= n - remainder ? 1 : 0)));
}

/**
 * Amount owed for a set of items, with the tab's discount and service charge shared proportionally.
 * @param {Array<{ id: string, quantity?: number }>} selection — item ids (and optional part quantity)
 */
export function itemsShare({ items = [], selection = [], discountAmount = 0, serviceChargeRate = 0 }) {
  const byId = new Map(billable(items).map((item) => [String(item.id), item]));
  let pickedC = 0;
  const lines = [];
  for (const pick of selection) {
    const item = byId.get(String(pick.id));
    if (!item) continue;
    const quantity = Math.min(Number(item.quantity) || 0, pick.quantity != null ? Number(pick.quantity) || 0 : Number(item.quantity) || 0);
    if (quantity <= 0) continue;
    pickedC += Math.round(cents(item.unit_price) * quantity);
    lines.push({ ...item, quantity });
  }
  const totals = tabTotals({ items, discountAmount, serviceChargeRate });
  const subtotalC = cents(totals.subtotal);
  if (subtotalC <= 0 || pickedC <= 0) return { amount: 0, lines };
  const shareC = Math.round((pickedC * cents(totals.total)) / subtotalC);
  return { amount: fromCents(shareC), lines };
}

/**
 * Balance of a tab given its bill portions (each with the payment intent status).
 * Paid portions reduce the balance; in-flight portions are "pending" and reserve their amount.
 */
export function tabBalance({ total, portions = [] }) {
  const ACTIVE = new Set(["pending", "requires_action", "processing"]);
  let paidC = 0;
  let pendingC = 0;
  for (const portion of portions) {
    const status = String(portion?.status || "").toLowerCase();
    if (status === "paid") paidC += cents(portion.amount);
    else if (ACTIVE.has(status)) pendingC += cents(portion.amount);
  }
  const totalC = cents(total);
  return {
    total: fromCents(totalC),
    paid: fromCents(paidC),
    pending: fromCents(pendingC),
    due: fromCents(Math.max(0, totalC - paidC)),
    available: fromCents(Math.max(0, totalC - paidC - pendingC)),
    settled: totalC > 0 ? paidC >= totalC : false,
  };
}

/**
 * Live table status for the floor plan (most urgent wins).
 * @param {{ table: object, tab?: object | null, items?: object[], tickets?: object[], balance?: object | null }} input
 */
export function deriveTableStatus({ table, tab = null, items = [], tickets = [], balance = null }) {
  if (!tab || tab.status !== "open") {
    return table?.cleaning_since ? TABLE_STATUS.CLEANING : TABLE_STATUS.AVAILABLE;
  }
  if (balance?.settled) return TABLE_STATUS.PAID;
  if (balance && balance.pending > 0) return TABLE_STATUS.PAYMENT_PENDING;
  if (tab.bill_requested_at) return TABLE_STATUS.BILL_REQUESTED;
  const live = (tickets || []).filter((t) => t.status !== KITCHEN_STATUS.VOID && t.status !== KITCHEN_STATUS.COMPLETED);
  if (live.some((t) => t.status === KITCHEN_STATUS.READY)) return TABLE_STATUS.READY;
  if (live.some((t) => t.status === KITCHEN_STATUS.NEW || t.status === KITCHEN_STATUS.PREPARING)) return TABLE_STATUS.KITCHEN;
  if ((items || []).some((i) => i.status === "pending")) return TABLE_STATUS.ORDERING;
  if ((items || []).some((i) => i.status === "sent")) return TABLE_STATUS.SEATED;
  return TABLE_STATUS.SEATED;
}

/** Group pending items into one kitchen ticket per station for this round. */
export function groupItemsByStation(items = []) {
  const groups = new Map();
  for (const item of items) {
    const station = normalizeStation(item.station);
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push(item);
  }
  return [...groups.entries()].map(([station, lines]) => ({ station, items: lines }));
}

/** KOT number: order 1048, round 2 → "1048-2" (a station suffix when a round splits across stations). */
export function kitchenTicketNumber(orderNumber, round, station = null, stationCount = 1) {
  const base = `${orderNumber}-${round}`;
  return stationCount > 1 && station ? `${base}-${normalizeStation(station).toUpperCase().slice(0, 3)}` : base;
}

export function minutesSince(iso, now = new Date()) {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now.getTime() - at) / 60000));
}

export function tabLabel(tab, table = null) {
  if (table?.name) return /^\d+$/.test(String(table.name).trim()) ? `Table ${String(table.name).trim()}` : String(table.name);
  if (tab?.order_type === ORDER_TYPE.TAKEAWAY) return `Takeaway #${tab.order_number}`;
  if (tab?.order_type === ORDER_TYPE.COUNTER) return `Counter #${tab.order_number}`;
  return tab?.order_number ? `Order #${tab.order_number}` : "Order";
}

/** Restaurant POS is on for restaurant businesses, and for any POS business that has set up tables. */
export function restaurantModeEnabled({ businessType, tableCount = 0 }) {
  return String(businessType || "").toLowerCase() === "restaurant" || Number(tableCount) > 0;
}

export function defaultOrderType({ businessType, tableCount = 0 }) {
  return restaurantModeEnabled({ businessType, tableCount }) ? ORDER_TYPE.DINE_IN : ORDER_TYPE.COUNTER;
}

// ── Order lifecycle (operational stage and payment are separate concerns) ────────────────
//
//   stage:   open (items being added) → kitchen (KOT new/preparing) → ready (KOT ready)
//            → served (every KOT completed = served / collected)
//   payment: none (nothing billable) · unpaid · partial · pending (provider confirming) · paid
//
// A READY + UNPAID order shows under both Ready and Payment; paying never marks food served and
// serving never marks it paid. Tab status (open / closed / void) stays the record's lifecycle.

export const ORDER_STAGE = Object.freeze({ OPEN: "open", KITCHEN: "kitchen", READY: "ready", SERVED: "served" });

export const PAYMENT_STATE = Object.freeze({ NONE: "none", UNPAID: "unpaid", PARTIAL: "partial", PENDING: "pending", PAID: "paid" });

export const STATUS_FILTER = Object.freeze({ ALL: "all", ACTIVE: "active", KITCHEN: "kitchen", READY: "ready", PAYMENT: "payment" });

export const STATUS_FILTER_OPTIONS = Object.freeze([
  { id: STATUS_FILTER.ALL, label: "All" },
  { id: STATUS_FILTER.ACTIVE, label: "Active" },
  { id: STATUS_FILTER.KITCHEN, label: "Kitchen" },
  { id: STATUS_FILTER.READY, label: "Ready" },
  { id: STATUS_FILTER.PAYMENT, label: "Payment" },
]);

export const LIVE_KITCHEN_STATUSES = Object.freeze([KITCHEN_STATUS.NEW, KITCHEN_STATUS.PREPARING, KITCHEN_STATUS.READY]);

/** Operational stage from the order's items and kitchen tickets. Ready wins over kitchen (food is waiting). */
export function orderStage({ items = [], tickets = [] } = {}) {
  const live = (tickets || []).filter((t) => LIVE_KITCHEN_STATUSES.includes(t.status));
  if (live.some((t) => t.status === KITCHEN_STATUS.READY)) return ORDER_STAGE.READY;
  if (live.length) return ORDER_STAGE.KITCHEN;
  const billable = (items || []).filter((i) => i.status !== "void");
  if (billable.some((i) => i.status === "pending")) return ORDER_STAGE.OPEN;
  const sent = billable.filter((i) => i.status === "sent");
  const served = sent.length > 0 && (tickets || []).some((t) => t.status === KITCHEN_STATUS.COMPLETED);
  return served ? ORDER_STAGE.SERVED : ORDER_STAGE.OPEN;
}

/** Payment state from the balance (see {@link tabBalance}). */
export function paymentState(balance) {
  if (!balance || !(Number(balance.total) > 0)) return PAYMENT_STATE.NONE;
  if (balance.settled) return PAYMENT_STATE.PAID;
  if (Number(balance.pending) > 0) return PAYMENT_STATE.PENDING;
  if (Number(balance.paid) > 0) return PAYMENT_STATE.PARTIAL;
  return PAYMENT_STATE.UNPAID;
}

export const ORDER_STAGE_LABEL = Object.freeze({
  [ORDER_STAGE.OPEN]: "Open",
  [ORDER_STAGE.KITCHEN]: "In kitchen",
  [ORDER_STAGE.READY]: "Ready",
  [ORDER_STAGE.SERVED]: "Served",
});

export const PAYMENT_STATE_LABEL = Object.freeze({
  [PAYMENT_STATE.NONE]: "No items",
  [PAYMENT_STATE.UNPAID]: "Unpaid",
  [PAYMENT_STATE.PARTIAL]: "Part paid",
  [PAYMENT_STATE.PENDING]: "Confirming payment",
  [PAYMENT_STATE.PAID]: "Paid",
});

/** Dine-in orders are "served"; takeaway and counter orders are "collected". */
export function serveVerb(orderType) {
  return orderType === ORDER_TYPE.DINE_IN ? "served" : "collected";
}

const isOpenOrder = (order) => order?.status === "open";

/**
 * Does this open order need payment now? Dine-in: once the bill is asked for, the food is ready or
 * served, or a payment has started. Takeaway / counter: as soon as anything billable has been sent
 * (they are usually paid before or at collection). Settled orders never do.
 */
export function orderNeedsPayment(order) {
  if (!isOpenOrder(order)) return false;
  const state = order.payment_state || paymentState(order.balance);
  if (state === PAYMENT_STATE.PAID || state === PAYMENT_STATE.NONE) return false;
  if (state === PAYMENT_STATE.PARTIAL || state === PAYMENT_STATE.PENDING) return true;
  if (order.order_type !== ORDER_TYPE.DINE_IN) return (order.sent_items ?? 1) > 0;
  return Boolean(order.bill_requested_at) || order.stage === ORDER_STAGE.READY || order.stage === ORDER_STAGE.SERVED;
}

/** Order-type filter (top navigation). Unknown/legacy order types count as dine-in. */
export function matchesOrderType(orderOrTicket, orderType) {
  if (!orderType) return true;
  const type = orderOrTicket?.order_type || ORDER_TYPE.DINE_IN;
  return type === orderType;
}

/**
 * Status filter (secondary navigation). Orders are tab summaries; kitchen is judged from the
 * order's kitchen counts so it agrees with the ticket queue.
 */
export function matchesStatusFilter(order, filter) {
  switch (filter) {
    case STATUS_FILTER.ALL:
      return order?.status === "open" || order?.status === "closed";
    case STATUS_FILTER.ACTIVE:
      return isOpenOrder(order);
    case STATUS_FILTER.KITCHEN:
      return isOpenOrder(order) && Number(order.kitchen?.waiting) > 0;
    case STATUS_FILTER.READY:
      return isOpenOrder(order) && Number(order.kitchen?.ready) > 0;
    case STATUS_FILTER.PAYMENT:
      return orderNeedsPayment(order);
    default:
      return false;
  }
}

/** Kitchen queue for an order type: tickets the kitchen still has to start or finish, oldest first. */
export function kitchenQueue(tickets = [], orderType = null) {
  return (tickets || [])
    .filter((t) => (t.status === KITCHEN_STATUS.NEW || t.status === KITCHEN_STATUS.PREPARING) && matchesOrderType(t, orderType))
    .sort((a, b) => String(a.sent_at || "").localeCompare(String(b.sent_at || "")));
}

/**
 * Live counts per status filter for one order type — from the same data the lists use.
 * Kitchen counts tickets (what the kitchen works through); the rest count orders.
 */
export function statusFilterCounts({ orders = [], tickets = [] } = {}, orderType = null) {
  const scoped = (orders || []).filter((o) => matchesOrderType(o, orderType));
  const count = (filter) => scoped.filter((o) => matchesStatusFilter(o, filter)).length;
  return {
    [STATUS_FILTER.ALL]: count(STATUS_FILTER.ALL),
    [STATUS_FILTER.ACTIVE]: count(STATUS_FILTER.ACTIVE),
    [STATUS_FILTER.KITCHEN]: kitchenQueue(tickets, orderType).length,
    [STATUS_FILTER.READY]: count(STATUS_FILTER.READY),
    [STATUS_FILTER.PAYMENT]: count(STATUS_FILTER.PAYMENT),
  };
}
