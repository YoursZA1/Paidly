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
  return tab?.order_number ? `Order #${tab.order_number}` : "Order";
}

/** Restaurant POS is on for restaurant businesses, and for any POS business that has set up tables. */
export function restaurantModeEnabled({ businessType, tableCount = 0 }) {
  return String(businessType || "").toLowerCase() === "restaurant" || Number(tableCount) > 0;
}

export function defaultOrderType({ businessType, tableCount = 0 }) {
  return restaurantModeEnabled({ businessType, tableCount }) ? ORDER_TYPE.DINE_IN : ORDER_TYPE.COUNTER;
}
