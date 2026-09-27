/**
 * Restaurant order filters: ORDER TYPE × STATUS (All · Active · Kitchen · Ready · Payment), stage vs
 * payment kept separate, live counts from the same data as the lists.
 */
import { describe, expect, it } from "vitest";
import {
  ORDER_STAGE,
  PAYMENT_STATE,
  STATUS_FILTER,
  kitchenQueue,
  matchesStatusFilter,
  orderNeedsPayment,
  orderStage,
  paymentState,
  statusFilterCounts,
} from "../../shared/pos/restaurant.js";

const order = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  status: "open",
  order_type: "dine_in",
  stage: ORDER_STAGE.OPEN,
  payment_state: PAYMENT_STATE.UNPAID,
  bill_requested_at: null,
  sent_items: 2,
  kitchen: { waiting: 0, ready: 0 },
  balance: { total: 100, paid: 0, pending: 0, due: 100, available: 100, settled: false },
  ...over,
});
const ticket = (status, order_type = "dine_in", sent_at = "2026-09-27T10:00:00Z") => ({ id: `${status}-${order_type}-${sent_at}`, status, order_type, sent_at });

describe("stage and payment are separate", () => {
  it("derives the stage from items and kitchen tickets", () => {
    expect(orderStage({ items: [{ status: "pending" }] })).toBe(ORDER_STAGE.OPEN);
    expect(orderStage({ items: [{ status: "sent" }], tickets: [{ status: "new" }] })).toBe(ORDER_STAGE.KITCHEN);
    expect(orderStage({ items: [{ status: "sent" }], tickets: [{ status: "preparing" }, { status: "ready" }] })).toBe(ORDER_STAGE.READY);
    expect(orderStage({ items: [{ status: "sent" }], tickets: [{ status: "completed" }] })).toBe(ORDER_STAGE.SERVED);
    // A new round after serving is "open" again until it is sent.
    expect(orderStage({ items: [{ status: "sent" }, { status: "pending" }], tickets: [{ status: "completed" }] })).toBe(ORDER_STAGE.OPEN);
  });

  it("derives the payment state from the balance only", () => {
    expect(paymentState({ total: 0 })).toBe(PAYMENT_STATE.NONE);
    expect(paymentState({ total: 100, paid: 0, pending: 0 })).toBe(PAYMENT_STATE.UNPAID);
    expect(paymentState({ total: 100, paid: 0, pending: 100 })).toBe(PAYMENT_STATE.PENDING);
    expect(paymentState({ total: 100, paid: 40, pending: 0 })).toBe(PAYMENT_STATE.PARTIAL);
    expect(paymentState({ total: 100, paid: 100, pending: 0, settled: true })).toBe(PAYMENT_STATE.PAID);
  });

  it("a READY + UNPAID order shows under Ready and Payment; paying removes it from Payment only", () => {
    const readyUnpaid = order({ stage: ORDER_STAGE.READY, kitchen: { waiting: 0, ready: 1 } });
    expect(matchesStatusFilter(readyUnpaid, STATUS_FILTER.READY)).toBe(true);
    expect(matchesStatusFilter(readyUnpaid, STATUS_FILTER.PAYMENT)).toBe(true);
    const readyPaid = { ...readyUnpaid, payment_state: PAYMENT_STATE.PAID };
    expect(matchesStatusFilter(readyPaid, STATUS_FILTER.READY)).toBe(true);
    expect(matchesStatusFilter(readyPaid, STATUS_FILTER.PAYMENT)).toBe(false);
  });
});

describe("payment filter", () => {
  it("dine-in needs payment once the bill is requested, the food is ready/served, or a payment started", () => {
    expect(orderNeedsPayment(order({ stage: ORDER_STAGE.KITCHEN }))).toBe(false);
    expect(orderNeedsPayment(order({ stage: ORDER_STAGE.KITCHEN, bill_requested_at: "x" }))).toBe(true);
    expect(orderNeedsPayment(order({ stage: ORDER_STAGE.SERVED }))).toBe(true);
    expect(orderNeedsPayment(order({ stage: ORDER_STAGE.KITCHEN, payment_state: PAYMENT_STATE.PARTIAL }))).toBe(true);
    expect(orderNeedsPayment(order({ stage: ORDER_STAGE.KITCHEN, payment_state: PAYMENT_STATE.PENDING }))).toBe(true);
  });

  it("takeaway and counter need payment as soon as something is sent; closed or empty orders never do", () => {
    expect(orderNeedsPayment(order({ order_type: "takeaway", stage: ORDER_STAGE.KITCHEN }))).toBe(true);
    expect(orderNeedsPayment(order({ order_type: "counter", stage: ORDER_STAGE.KITCHEN }))).toBe(true);
    expect(orderNeedsPayment(order({ order_type: "takeaway", sent_items: 0 }))).toBe(false);
    expect(orderNeedsPayment(order({ status: "closed", stage: ORDER_STAGE.SERVED }))).toBe(false);
    expect(orderNeedsPayment(order({ payment_state: PAYMENT_STATE.NONE, stage: ORDER_STAGE.SERVED }))).toBe(false);
  });
});

describe("filters combine with the order type", () => {
  const data = {
    orders: [
      order({ id: "t1", stage: ORDER_STAGE.KITCHEN, kitchen: { waiting: 2, ready: 0 } }),
      order({ id: "t2", stage: ORDER_STAGE.READY, kitchen: { waiting: 0, ready: 1 } }),
      order({ id: "t4", stage: ORDER_STAGE.SERVED, bill_requested_at: "x" }),
      order({ id: "t5", stage: ORDER_STAGE.SERVED, payment_state: PAYMENT_STATE.PAID }),
      order({ id: "done", status: "closed", payment_state: PAYMENT_STATE.PAID, stage: ORDER_STAGE.SERVED }),
      order({ id: "void", status: "void" }),
      order({ id: "ta", order_type: "takeaway", stage: ORDER_STAGE.READY, kitchen: { waiting: 0, ready: 1 } }),
      order({ id: "co", order_type: "counter", stage: ORDER_STAGE.KITCHEN, kitchen: { waiting: 1, ready: 0 }, payment_state: PAYMENT_STATE.PAID }),
    ],
    tickets: [ticket("new"), ticket("preparing"), ticket("ready"), ticket("new", "takeaway"), ticket("preparing", "counter")],
  };

  it("counts per order type from real rows (All includes today's completed; Active excludes closed/void)", () => {
    expect(statusFilterCounts(data, "dine_in")).toEqual({ all: 5, active: 4, kitchen: 2, ready: 1, payment: 2 });
    expect(statusFilterCounts(data, "takeaway")).toEqual({ all: 1, active: 1, kitchen: 1, ready: 1, payment: 1 });
    expect(statusFilterCounts(data, "counter")).toEqual({ all: 1, active: 1, kitchen: 1, ready: 0, payment: 0 });
  });

  it("never mixes order types", () => {
    const ids = (type, filter) => data.orders.filter((o) => (o.order_type || "dine_in") === type && matchesStatusFilter(o, filter)).map((o) => o.id);
    expect(ids("dine_in", STATUS_FILTER.READY)).toEqual(["t2"]);
    expect(ids("takeaway", STATUS_FILTER.READY)).toEqual(["ta"]);
    expect(ids("counter", STATUS_FILTER.PAYMENT)).toEqual([]);
    expect(ids("dine_in", STATUS_FILTER.PAYMENT)).toEqual(["t2", "t4"]);
  });

  it("the kitchen queue is the tickets to start or finish, oldest first, for that order type", () => {
    const q = kitchenQueue(
      [ticket("preparing", "dine_in", "2026-09-27T10:05:00Z"), ticket("new", "dine_in", "2026-09-27T10:01:00Z"), ticket("ready"), ticket("new", "takeaway")],
      "dine_in"
    );
    expect(q.map((t) => t.status)).toEqual(["new", "preparing"]);
  });
});
