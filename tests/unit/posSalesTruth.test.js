import { describe, expect, it } from "vitest";
import { collectIncomeEvents } from "@/utils/cashFlowTruth";
import { collectPosIncomeEvents, summarizePosSales } from "@/utils/posSalesTruth";

const sale = {
  id: "s1",
  sale_kind: "sale",
  status: "completed",
  total_amount: 90,
  payment_method: "cash",
  occurred_at: "2026-08-28T10:00:00.000Z",
  items: [{ product_id: "p1", name: "Coffee", quantity: 2, unit_price: 50 }],
  raw_payload: { subtotal: 100, discount_amount: 10, tax_amount: 0 },
};

const cashReturn = {
  id: "r1",
  sale_kind: "return",
  status: "completed",
  total_amount: -50,
  payment_method: "cash",
  refund_rail: "till_cash",
  occurred_at: "2026-08-28T12:00:00.000Z",
  items: [{ product_id: "p1", name: "Coffee", quantity: 1, unit_price: 50 }],
};

const pendingReturn = {
  id: "r2",
  sale_kind: "return",
  status: "completed",
  total_amount: -40,
  payment_method: "digital",
  refund_rail: "pending_provider",
  occurred_at: "2026-08-28T13:00:00.000Z",
  items: [{ product_id: "p2", name: "Tea", quantity: 1, unit_price: 40 }],
};

describe("posSalesTruth", () => {
  it("counts gross, discount, cash, digital, refunds, units, and net", () => {
    const digital = {
      ...sale,
      id: "s2",
      payment_method: "digital",
      total_amount: 40,
      items: [{ product_id: "p2", name: "Tea", quantity: 1, unit_price: 40 }],
      raw_payload: { subtotal: 40, discount_amount: 0, tax_amount: 0 },
    };
    const summary = summarizePosSales([sale, digital, cashReturn, pendingReturn], {
      start: new Date("2026-08-28T00:00:00"),
      end: new Date("2026-08-28T00:00:00"),
    });
    expect(summary.gross_sales).toBe(140);
    expect(summary.discounts).toBe(10);
    expect(summary.tax).toBe(0);
    expect(summary.pos_sales).toBe(130);
    expect(summary.cash_sales).toBe(90);
    expect(summary.digital_sales).toBe(40);
    expect(summary.refunds).toBe(90);
    expect(summary.net_sales).toBe(40);
    expect(summary.units_sold).toBe(1);
    expect(summary.top_products[0].name).toBe("Coffee");
    expect(summary.top_products[0].units).toBe(1);
  });

  it("puts till sales into cash-flow income and only subtracts till_cash refunds", () => {
    const events = collectPosIncomeEvents([sale, cashReturn, pendingReturn]);
    expect(events.find((row) => row.id === "pos-s1")?.amount).toBe(90);
    expect(events.find((row) => row.id === "pos-ret-r1")?.amount).toBe(-50);
    expect(events.find((row) => row.id === "pos-ret-r2")).toBeUndefined();
  });

  it("does not double-count a POS tax-invoice copy when the till event is present", () => {
    const events = collectIncomeEvents(
      [{ id: "p-pos", invoice_id: "inv-pos", amount: 90, status: "completed", paid_at: "2026-08-28" }],
      [{ id: "inv-pos", status: "paid", total_amount: 90, pos_sale_event_id: "s1" }],
      [sale]
    );
    expect(events.filter((row) => row.channel === "pos")).toHaveLength(1);
    expect(events.reduce((sum, row) => sum + row.amount, 0)).toBe(90);
  });
});
