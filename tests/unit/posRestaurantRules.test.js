/**
 * Restaurant POS pure rules (shared/pos/restaurant.js).
 */
import { describe, expect, it } from "vitest";
import {
  KITCHEN_STATUS,
  ORDER_TYPE,
  TABLE_STATUS,
  canMoveKitchenTicket,
  defaultOrderType,
  deriveTableStatus,
  groupItemsByStation,
  itemsShare,
  kitchenTicketNumber,
  normalizeStation,
  restaurantModeEnabled,
  splitEqually,
  stationLabel,
  tabBalance,
  tabLabel,
  tabTotals,
} from "../../shared/pos/restaurant.js";
import { businessTypeIncludesPos, normalizeBusinessType } from "../../shared/businessType.js";

const burger = { id: "i1", name: "Chicken Burger", quantity: 2, unit_price: 90, status: "sent" };
const coke = { id: "i2", name: "Coke", quantity: 1, unit_price: 25, status: "sent" };
const capp = { id: "i3", name: "Cappuccino", quantity: 2, unit_price: 35, status: "sent" };
const cake = { id: "i4", name: "Cheesecake", quantity: 1, unit_price: 45, status: "sent" };
const table12 = [burger, coke, capp, cake]; // R320

describe("tab totals", () => {
  it("sums non-void items, applies discount then service charge", () => {
    expect(tabTotals({ items: table12 })).toEqual({ subtotal: 320, discount_amount: 0, service_charge: 0, total: 320 });
    expect(tabTotals({ items: [...table12, { quantity: 1, unit_price: 99, status: "void" }] }).total).toBe(320);
    expect(tabTotals({ items: table12, discountAmount: 20, serviceChargeRate: 10 })).toEqual({
      subtotal: 320,
      discount_amount: 20,
      service_charge: 30,
      total: 330,
    });
    expect(tabTotals({ items: table12, discountAmount: 999 }).total).toBe(0);
  });
});

describe("split bills", () => {
  it("splits equally to the cent, remainder on the last guests", () => {
    expect(splitEqually(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitEqually(320, 4)).toEqual([80, 80, 80, 80]);
    const parts = splitEqually(330.01, 4);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(330.01, 2);
  });

  it("splits by item with discount and service charge shared proportionally", () => {
    const guest1 = itemsShare({ items: table12, selection: [{ id: "i1", quantity: 1 }, { id: "i2" }] });
    expect(guest1.amount).toBe(115); // 90 + 25
    const withService = itemsShare({ items: table12, selection: [{ id: "i4" }], serviceChargeRate: 10 });
    expect(withService.amount).toBe(49.5); // 45 + 10% service charge
    expect(itemsShare({ items: table12, selection: [{ id: "nope" }] }).amount).toBe(0);
  });

  it("balance counts paid portions and reserves in-flight ones", () => {
    const b = tabBalance({
      total: 320,
      portions: [
        { amount: 80, status: "paid" },
        { amount: 80, status: "requires_action" },
        { amount: 80, status: "failed" },
      ],
    });
    expect(b).toEqual({ total: 320, paid: 80, pending: 80, due: 240, available: 160, settled: false });
    expect(tabBalance({ total: 320, portions: [{ amount: 320, status: "paid" }] }).settled).toBe(true);
  });
});

describe("table status", () => {
  const table = { id: "t1", cleaning_since: null };
  const tab = { status: "open", bill_requested_at: null };
  it("available, cleaning, seated, ordering", () => {
    expect(deriveTableStatus({ table })).toBe(TABLE_STATUS.AVAILABLE);
    expect(deriveTableStatus({ table: { cleaning_since: "2026-09-27T10:00:00Z" } })).toBe(TABLE_STATUS.CLEANING);
    expect(deriveTableStatus({ table, tab })).toBe(TABLE_STATUS.SEATED);
    expect(deriveTableStatus({ table, tab, items: [{ status: "pending" }] })).toBe(TABLE_STATUS.ORDERING);
  });
  it("kitchen and ready follow the tickets; ready wins", () => {
    expect(deriveTableStatus({ table, tab, items: [burger], tickets: [{ status: KITCHEN_STATUS.PREPARING }] })).toBe(TABLE_STATUS.KITCHEN);
    expect(
      deriveTableStatus({ table, tab, tickets: [{ status: KITCHEN_STATUS.NEW }, { status: KITCHEN_STATUS.READY }] })
    ).toBe(TABLE_STATUS.READY);
  });
  it("bill requested, payment pending and paid take priority", () => {
    expect(deriveTableStatus({ table, tab: { ...tab, bill_requested_at: "x" }, tickets: [{ status: "ready" }] })).toBe(TABLE_STATUS.BILL_REQUESTED);
    expect(deriveTableStatus({ table, tab, balance: { pending: 80, settled: false } })).toBe(TABLE_STATUS.PAYMENT_PENDING);
    expect(deriveTableStatus({ table, tab, balance: { pending: 0, settled: true } })).toBe(TABLE_STATUS.PAID);
  });
});

describe("kitchen", () => {
  it("routes items to one ticket per station", () => {
    const groups = groupItemsByStation([
      { name: "Burger", station: "Grill" },
      { name: "Fries", station: "fryer" },
      { name: "Coke", station: "bar" },
      { name: "Cappuccino", station: "bar" },
      { name: "Salad", station: null },
    ]);
    expect(groups.map((g) => [g.station, g.items.length])).toEqual([
      ["grill", 1],
      ["fryer", 1],
      ["bar", 2],
      ["kitchen", 1],
    ]);
  });
  it("numbers tickets per order round (station suffix only when a round splits)", () => {
    expect(kitchenTicketNumber(1048, 2)).toBe("1048-2");
    expect(kitchenTicketNumber(1048, 2, "bar", 2)).toBe("1048-2-BAR");
  });
  it("KDS moves new → preparing → ready → completed only", () => {
    expect(canMoveKitchenTicket("new", "preparing")).toBe(true);
    expect(canMoveKitchenTicket("preparing", "ready")).toBe(true);
    expect(canMoveKitchenTicket("ready", "completed")).toBe(true);
    expect(canMoveKitchenTicket("new", "completed")).toBe(false);
    expect(canMoveKitchenTicket("completed", "preparing")).toBe(false);
  });
  it("normalizes and labels stations", () => {
    expect(normalizeStation("  Hot Line ")).toBe("hot_line");
    expect(normalizeStation("")).toBe("kitchen");
    expect(stationLabel("hot_line")).toBe("Hot Line");
  });
});

describe("modes and labels", () => {
  it("restaurant business type turns restaurant mode on; retail stays counter", () => {
    expect(normalizeBusinessType("Restaurant")).toBe("restaurant");
    expect(normalizeBusinessType("café")).toBe("restaurant");
    expect(businessTypeIncludesPos("restaurant")).toBe(true);
    expect(defaultOrderType({ businessType: "restaurant" })).toBe(ORDER_TYPE.DINE_IN);
    expect(defaultOrderType({ businessType: "retail" })).toBe(ORDER_TYPE.COUNTER);
    // Hospitality follows the business type only — tables set up on a mixed/retail till don't turn it on.
    expect(restaurantModeEnabled({ businessType: "mixed", tableCount: 6 })).toBe(false);
    expect(restaurantModeEnabled({ businessType: "retail", tableCount: 6 })).toBe(false);
    expect(restaurantModeEnabled({ businessType: "bar" })).toBe(true);
  });
  it("labels tabs", () => {
    expect(tabLabel({}, { name: "12" })).toBe("Table 12");
    expect(tabLabel({}, { name: "Patio 3" })).toBe("Patio 3");
    expect(tabLabel({ order_type: "takeaway", order_number: 1049 })).toBe("Takeaway #1049");
  });
});
