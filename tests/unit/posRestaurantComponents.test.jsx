/** @vitest-environment jsdom */
/**
 * Restaurant POS till components: floor plan, context-aware order panel, bill / split dialog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/utils/confetti", () => ({ runPaidConfetti: () => {} }));
const payCalls = [];
const payResult = { current: null };
vi.mock("@/services/PosRestaurantService", () => ({
  payTab: async (body) => {
    payCalls.push(body);
    return payResult.current;
  },
}));

const { default: PosFloorView } = await import("@/components/pos/restaurant/PosFloorView");
const { default: PosTabPanel } = await import("@/components/pos/restaurant/PosTabPanel");
const { default: PosBillDialog } = await import("@/components/pos/restaurant/PosBillDialog");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ||= () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

let container;
let root;
beforeEach(() => {
  payCalls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render(ui) {
  await act(async () => root.render(ui));
}
const text = () => document.body.textContent.replace(/\s+/g, " ");
const button = (label) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim().includes(label));
const click = async (el) => act(async () => el.click());

const totals = (total, extra = {}) => ({ subtotal: total, discount_amount: 0, service_charge: 0, total, ...extra });
const balance = (total, paid = 0, pending = 0) => ({
  total,
  paid,
  pending,
  due: total - paid,
  available: total - paid - pending,
  settled: total > 0 && paid >= total,
});

const tab12 = {
  id: "tab-1",
  order_number: 1048,
  order_type: "dine_in",
  status: "open",
  label: "Table 12",
  table_status: "kitchen",
  guests: 4,
  server_name: "Mando",
  opened_at: "2026-09-27T18:42:00",
  discount_amount: 0,
  service_charge_rate: 0,
  totals: totals(320),
  balance: balance(320),
};

const sentItems = [
  { id: "i1", name: "Chicken Burger", quantity: 2, unit_price: 90, line_total: 180, status: "sent", round: 1, station: "grill", kitchen_status: "preparing", note: "Extra cheese" },
  { id: "i2", name: "Coke", quantity: 1, unit_price: 25, line_total: 25, status: "sent", round: 1, station: "bar", kitchen_status: "ready" },
  { id: "i3", name: "Cappuccino", quantity: 2, unit_price: 35, line_total: 70, status: "sent", round: 1, station: "bar", kitchen_status: "ready" },
  { id: "i4", name: "Cheesecake", quantity: 1, unit_price: 45, line_total: 45, status: "sent", round: 1, station: "kitchen", kitchen_status: "preparing" },
];

describe("PosFloorView", () => {
  const floorState = {
    floors: [{ id: "f1", name: "Floor 1" }, { id: "f2", name: "Patio" }],
    tables: [
      { id: "t1", floor_id: "f1", name: "1", seats: 2, pos_x: 0, pos_y: 0, status: "kitchen", tab: { ...tab12, id: "tab-a", minutes_open: 32, guests: 2 } },
      { id: "t2", floor_id: "f1", name: "2", seats: 4, pos_x: 1, pos_y: 0, status: "available", tab: null },
      { id: "t3", floor_id: "f1", name: "3", seats: 2, pos_x: 2, pos_y: 0, status: "cleaning", tab: null },
      { id: "t9", floor_id: "f2", name: "Patio 1", seats: 6, pos_x: 0, pos_y: 0, status: "available", tab: null },
    ],
    takeaway: [],
  };

  it("renders tables with their status and routes taps", async () => {
    const onOpenTab = vi.fn();
    const onSeatTable = vi.fn(async () => {});
    const onMarkClean = vi.fn();
    await render(
      <PosFloorView floorState={floorState} currency="ZAR" canSell onOpenTab={onOpenTab} onSeatTable={onSeatTable} onMarkClean={onMarkClean} onOpenTakeaway={() => {}} />
    );
    const t = text();
    expect(t).toContain("Table 1");
    expect(t).toContain("Kitchen · 32 min");
    expect(t).toContain("Free");
    expect(t).toContain("Cleaning");
    expect(t).not.toContain("Patio 1"); // other floor hidden

    await click(document.querySelector('[aria-label="Table 1, Kitchen"]'));
    expect(onOpenTab).toHaveBeenCalledWith("tab-a");

    await click(document.querySelector('[aria-label="Table 3, Cleaning"]'));
    expect(onMarkClean).toHaveBeenCalled();

    await click(document.querySelector('[aria-label="Table 2, Available"]'));
    expect(text()).toContain("Seat Table 2");
    await click(button("Open table"));
    expect(onSeatTable).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }), 4);

    await click(button("Patio"));
    expect(text()).toContain("Patio 1");
  });
});

describe("PosTabPanel (context-aware cart)", () => {
  const handlers = () => ({
    onQty: vi.fn(),
    onNote: vi.fn(),
    onSend: vi.fn(),
    onSave: vi.fn(),
    onPay: vi.fn(),
    onSplit: vi.fn(),
    onVoidItem: vi.fn(),
    onCloseTab: vi.fn(),
    onServe: vi.fn(),
    onRequestBill: vi.fn(),
  });

  it("says which table is being edited and separates previous rounds from NEW ITEMS", async () => {
    const h = handlers();
    await render(
      <PosTabPanel
        bundle={{ tab: tab12, items: sentItems }}
        orderType="dine_in"
        newItems={[{ product_id: "p-water", name: "Water", quantity: 2, unit_price: 15 }]}
        currency="ZAR"
        {...h}
      />
    );
    const t = text();
    expect(t).toContain("Table 12");
    expect(t).toContain("4 guests · Server: Mando · 18:42");
    expect(t).toContain("Round 1");
    expect(t).toContain("– Extra cheese");
    expect(t).toContain("New items (2)");
    expect(button("Send new items")).toBeTruthy();
    // Paying is blocked while there are unsent items.
    expect(button("Pay").disabled).toBe(true);
    expect(t).toContain("Send or remove new items before taking payment.");
    await click(button("Send new items"));
    expect(h.onSend).toHaveBeenCalled();
    await click(document.querySelector('[aria-label="More Water"]'));
    expect(h.onQty).toHaveBeenCalledWith("p-water", 3);
  });

  it("with nothing new, shows Pay for the balance; a settled bill offers Close table", async () => {
    const h = handlers();
    await render(<PosTabPanel bundle={{ tab: { ...tab12, balance: balance(320, 80) }, items: sentItems }} orderType="dine_in" newItems={[]} currency="ZAR" {...h} />);
    expect(text()).toContain("Due");
    const pay = button("Pay");
    expect(pay.disabled).toBe(false);
    await click(pay);
    expect(h.onPay).toHaveBeenCalled();

    await render(<PosTabPanel bundle={{ tab: { ...tab12, balance: balance(320, 320) }, items: sentItems }} orderType="dine_in" newItems={[]} currency="ZAR" {...h} />);
    await click(button("Close table"));
    expect(h.onCloseTab).toHaveBeenCalled();
  });

  it("takeaway without a tab asks for items first", async () => {
    await render(<PosTabPanel bundle={null} orderType="takeaway" newItems={[]} currency="ZAR" {...handlers()} />);
    expect(text()).toContain("New takeaway order");
    expect(text()).toContain("Tap menu items to add them.");
  });
});

describe("PosTabPanel (lifecycle actions)", () => {
  const handlers = () => ({
    onQty: vi.fn(), onNote: vi.fn(), onSend: vi.fn(), onSave: vi.fn(), onPay: vi.fn(), onSplit: vi.fn(),
    onVoidItem: vi.fn(), onCloseTab: vi.fn(), onServe: vi.fn(), onRequestBill: vi.fn(),
  });

  it("before anything is selected it asks for an order, not a table", async () => {
    await render(<PosTabPanel bundle={null} orderType="dine_in" newItems={[]} currency="ZAR" {...handlers()} />);
    expect(text()).toContain("Choose an order");
    expect(text()).toContain("Select a table or order to begin.");
    expect(button("Send to kitchen")).toBeUndefined();
    expect(button("Pay")).toBeUndefined();
  });

  it("ready food shows Mark served; an unpaid served table offers Request bill", async () => {
    const h = handlers();
    await render(<PosTabPanel bundle={{ tab: { ...tab12, kitchen: { ready: 2, waiting: 0 } }, items: sentItems }} orderType="dine_in" newItems={[]} currency="ZAR" {...h} />);
    await click(button("Mark served"));
    expect(h.onServe).toHaveBeenCalled();
    await click(button("Request bill"));
    expect(h.onRequestBill).toHaveBeenCalled();
    // No new items → no Send button (opening an order never re-sends).
    expect(button("Send")).toBeUndefined();
  });

  it("a paid takeaway shows PAID, no Pay, and Complete order", async () => {
    const h = handlers();
    const tab = { ...tab12, order_type: "takeaway", label: "Takeaway #1053", table_status: null, guests: null, balance: balance(320, 320), kitchen: { ready: 1, waiting: 0 } };
    await render(<PosTabPanel bundle={{ tab, items: sentItems }} orderType="takeaway" newItems={[]} currency="ZAR" {...h} />);
    expect(text()).toContain("PAID");
    expect(button("Pay R")).toBeUndefined();
    expect(button("Mark collected")).toBeTruthy();
    await click(button("Complete order"));
    expect(h.onCloseTab).toHaveBeenCalled();
  });
});

describe("PosBillDialog (split bills)", () => {
  const bundle = { tab: { ...tab12, table_status: "ready" }, items: sentItems, portions: [] };

  it("split equally → pay guest 1 → Done state with balance and 'Pay next guest'", async () => {
    payResult.current = {
      ok: true,
      paid: true,
      change_due: 20,
      portion: { label: "Guest 1 of 4", amount: 80 },
      sale: { id: "sale-1" },
      tab: { ...tab12, balance: balance(320, 80) },
    };
    const onPaid = vi.fn();
    await render(<PosBillDialog open bundle={bundle} currency="ZAR" digitalProvider={null} initialMode="equal" onOpenChange={() => {}} onPaid={onPaid} />);
    await click(button("4"));
    await click(button("Guest 1"));
    const take = button("cash");
    expect(take.disabled).toBe(false);
    await click(take);
    expect(payCalls[0]).toMatchObject({ tab_id: "tab-1", payment_method: "cash", split: { kind: "equal", parts: 4, part_index: 0 } });
    expect(onPaid).toHaveBeenCalled();
    expect(text()).toContain("Guest 1 of 4 paid");
    expect(text()).toContain("still to pay");
    expect(button("Pay next guest")).toBeTruthy();
  });

  it("EFT is disabled when no digital provider is connected; by-item lists only unpaid items", async () => {
    await render(
      <PosBillDialog
        open
        bundle={{ ...bundle, portions: [{ status: "paid", split_kind: "items", allocation: { carried_item_ids: ["i4"] }, amount: 45 }] }}
        currency="ZAR"
        digitalProvider={null}
        initialMode="items"
        onOpenChange={() => {}}
      />
    );
    expect(button("EFT / Digital").disabled).toBe(true);
    expect(text()).toContain("Chicken Burger");
    expect(text()).not.toContain("Cheesecake");
  });
});
