/** @vitest-environment jsdom */
/**
 * Orders screen on the till: status filters combined with the order type, live counts, kitchen
 * queue actions, Ready / Payment actions and useful empty states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const feed = vi.hoisted(() => ({ current: null, fetches: 0, moves: [] }));
vi.mock("@/services/PosRestaurantService", () => ({
  fetchRestaurantOrders: async () => {
    feed.fetches += 1;
    return feed.current;
  },
  moveKitchenTicket: async (id, status) => {
    feed.moves.push([id, status]);
    return { ok: true };
  },
  fetchKitchen: async () => ({ tickets: [] }),
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const { default: PosOrdersView } = await import("@/components/pos/restaurant/PosOrdersView");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
beforeEach(() => {
  feed.fetches = 0;
  feed.moves.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const bal = (total, paid = 0, pending = 0) => ({ total, paid, pending, due: total - paid, available: total - paid - pending, settled: total > 0 && paid >= total });
const order = (over) => ({
  status: "open",
  order_type: "dine_in",
  stage: "kitchen",
  payment_state: "unpaid",
  pending_items: 0,
  sent_items: 2,
  minutes_open: 12,
  opened_at: "2026-09-27T10:00:00Z",
  kitchen: { waiting: 0, ready: 0 },
  totals: { subtotal: 245, discount_amount: 0, service_charge: 0, total: 245 },
  balance: bal(245),
  lines: [
    { id: "l1", name: "Chicken Burger", quantity: 2, status: "sent" },
    { id: "l2", name: "Coke", quantity: 2, status: "sent" },
  ],
  ...over,
});

const DATA = {
  generated_at: "2026-09-27T10:12:00Z",
  orders: [
    order({ id: "o1", order_number: 1048, label: "Table 1", table_status: "kitchen", kitchen: { waiting: 1, ready: 0 } }),
    order({ id: "o2", order_number: 1049, label: "Table 2", stage: "ready", table_status: "ready", kitchen: { waiting: 0, ready: 1 }, balance: bal(580), totals: { total: 580 } }),
    order({ id: "o3", order_number: 1053, label: "Takeaway #1053", order_type: "takeaway", customer_name: "John", stage: "ready", kitchen: { waiting: 0, ready: 1 }, payment_state: "paid", balance: bal(145, 145) }),
    order({ id: "o9", order_number: 1040, label: "Table 9", status: "closed", closed_at: "2026-09-27T09:00:00Z", payment_state: "paid", stage: "served" }),
  ],
  tickets: [
    { id: "k1", tab_id: "o1", order_type: "dine_in", status: "new", ticket_number: "1048-1", station: "kitchen", table_label: "Table 1", sent_at: "2026-09-27T10:05:00Z", items: [{ id: "i1", name: "Chicken Burger", quantity: 2, note: "No onions" }] },
    { id: "k2", tab_id: "o2", order_type: "dine_in", status: "ready", ticket_number: "1049-1", station: "kitchen", table_label: "Table 2", sent_at: "2026-09-27T09:55:00Z", items: [] },
  ],
};

async function render(props = {}) {
  await act(async () => root.render(<PosOrdersView currency="ZAR" {...props} />));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}
const text = () => container.textContent.replace(/\s+/g, " ");
const tab = (label) => [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent.startsWith(label));
const button = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(label));
const click = async (el) => act(async () => el.click());

describe("PosOrdersView", () => {
  it("shows live counts per status for the selected order type", async () => {
    feed.current = DATA;
    await render({ orderType: "dine_in" });
    expect(tab("All").textContent).toBe("All3");
    expect(tab("Active").textContent).toBe("Active2");
    expect(tab("Kitchen").textContent).toBe("Kitchen1");
    expect(tab("Ready").textContent).toBe("Ready1");
    expect(tab("Payment").textContent).toBe("Payment1");
    // All: live tables plus today's completed, never the takeaway order.
    expect(text()).toContain("Table 1");
    expect(text()).toContain("Completed today");
    expect(text()).not.toContain("Takeaway #1053");
  });

  it("switching filters does not refetch", async () => {
    feed.current = DATA;
    await render({ orderType: "dine_in" });
    const before = feed.fetches;
    await click(tab("Ready"));
    await click(tab("Payment"));
    await click(tab("Active"));
    expect(feed.fetches).toBe(before);
  });

  it("Kitchen is the KOT queue with a real action", async () => {
    feed.current = DATA;
    await render({ orderType: "dine_in" });
    await click(tab("Kitchen"));
    expect(text()).toContain("KOT #1048-1");
    expect(text()).toContain("No onions");
    expect(text()).not.toContain("1049-1"); // ready tickets are not kitchen work
    await click(button("Start preparing"));
    expect(feed.moves).toEqual([["k1", "preparing"]]);
  });

  it("Ready offers Mark served for tables and Collected for a paid takeaway", async () => {
    const onServe = vi.fn(async () => ({}));
    feed.current = DATA;
    await render({ orderType: "dine_in", onServe });
    await click(tab("Ready"));
    await click(button("Mark served"));
    expect(onServe).toHaveBeenCalledWith("o2");

    await render({ orderType: "takeaway", onServe });
    await click(tab("Ready"));
    expect(button("Collected · complete")).toBeTruthy();
    expect(text()).toContain("Paid");
  });

  it("Payment lists unpaid orders with Pay and Split bill (paid orders never show Pay)", async () => {
    const onPay = vi.fn();
    feed.current = DATA;
    await render({ orderType: "dine_in", onPay });
    await click(tab("Payment"));
    expect(text()).toContain("Table 2");
    expect(text()).not.toContain("Table 1");
    await click(button("Pay R"));
    expect(onPay).toHaveBeenCalledWith("o2", "full");
    await click(button("Split bill"));
    expect(onPay).toHaveBeenCalledWith("o2", "equal");

    await render({ orderType: "takeaway", onPay });
    await click(tab("Payment"));
    expect(text()).toContain("No orders are waiting for payment.");
  });

  it("empty states are specific to the order type and filter", async () => {
    feed.current = { orders: [], tickets: [], generated_at: DATA.generated_at };
    const onNewOrder = vi.fn();
    await render({ orderType: "takeaway", onNewOrder });
    expect(text()).toContain("No active takeaway orders.");
    await click(button("New takeaway order"));
    expect(onNewOrder).toHaveBeenCalled();
    await click(tab("Kitchen"));
    expect(text()).toContain("No orders waiting for the kitchen.");
    expect(tab("Kitchen").textContent).toBe("Kitchen0");
    await render({ orderType: "counter", onNewOrder });
    await click(tab("All"));
    expect(text()).toContain("No active counter orders.");
    expect(button("New counter sale")).toBeTruthy();
    expect(text()).not.toMatch(/\bNone\b/);
  });
});
