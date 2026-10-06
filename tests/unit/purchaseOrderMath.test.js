import { describe, expect, it } from "vitest";
import {
  purchaseOrderFinancialStatus,
  paymentTermsCodeFromText,
  purchaseOrderDueDate,
  purchaseOrderPaymentSchedule,
  supplierOutflowWithin,
  purchaseOrderFinancials,
  purchaseOrderLineAmounts,
  purchaseOrderLineReceivedAmounts,
  purchaseOrderTotals,
  summarizePurchaseOrders,
} from "../../shared/procurement/purchaseOrderMath.js";

describe("purchase order line math (mirrors purchase_order_line_amounts)", () => {
  it("rounds discount and VAT on whole cents, half away from zero", () => {
    // Same case as purchaseOrderFinancials.db.test.js.
    expect(purchaseOrderLineAmounts({ quantity_ordered: 3, unit_cost: 33.33, discount_percent: 10, vat_rate: 15 })).toEqual({
      gross: 99.99,
      discount: 10,
      net: 89.99,
      vat: 13.5,
      total: 103.49,
    });
  });

  it("does not drift on values that are inexact in binary floating point", () => {
    expect(purchaseOrderLineAmounts({ quantity_ordered: 1, unit_cost: 1.005 }).total).toBe(1.01);
    expect(purchaseOrderLineAmounts({ quantity_ordered: 0.1, unit_cost: 0.2, vat_rate: 15 }).total).toBe(0.02);
    expect(purchaseOrderLineAmounts({ quantity_ordered: 7, unit_cost: 19.99, vat_rate: 15 })).toMatchObject({
      gross: 139.93,
      vat: 20.99,
      total: 160.92,
    });
  });

  it("values only what has been received", () => {
    expect(purchaseOrderLineReceivedAmounts({ quantity_received: 4, unit_cost: 100, vat_rate: 15 }).total).toBe(460);
    expect(purchaseOrderLineReceivedAmounts({ unit_cost: 100 }).total).toBe(0);
  });

  it("totals PO-1001 at R2,000", () => {
    expect(
      purchaseOrderTotals([
        { quantity_ordered: 10, unit_cost: 100 },
        { quantity_ordered: 5, unit_cost: 200 },
      ])
    ).toEqual({ subtotal: 2000, discountTotal: 0, vatTotal: 0, total: 2000 });
  });

  it("totals sum rounded lines, like the database", () => {
    expect(
      purchaseOrderTotals([
        { quantity_ordered: 3, unit_cost: 33.33, discount_percent: 10, vat_rate: 15 },
        { quantity_ordered: 1, unit_cost: 150, vat_rate: 15 },
      ])
    ).toEqual({ subtotal: 249.99, discountTotal: 10, vatTotal: 36, total: 275.99 });
  });
});

describe("purchase order financial position", () => {
  it("a draft commits nothing", () => {
    expect(purchaseOrderFinancials({ status: "draft", total_amount: 2000 })).toMatchObject({
      committed: 0,
      owed: 0,
      awaitingDelivery: 0,
      paymentStatus: "none",
    });
  });

  it("approved, received, unpaid: R2,000 committed, received and owed", () => {
    expect(
      purchaseOrderFinancials({ status: "received", total_amount: 2000, received_amount: 2000, amount_paid: 0 })
    ).toMatchObject({ committed: 2000, received: 2000, paid: 0, owed: 2000, payableNow: 2000, paymentStatus: "unpaid" });
  });

  it("a deposit before delivery is owed but not yet payable", () => {
    expect(
      purchaseOrderFinancials({ status: "approved", total_amount: 1000, received_amount: 0, amount_paid: 300 })
    ).toMatchObject({ committed: 1000, awaitingDelivery: 1000, owed: 700, payableNow: 0, paymentStatus: "partially_paid" });
  });

  it("cancelling releases what was never received", () => {
    expect(
      purchaseOrderFinancials({ status: "cancelled", total_amount: 1000, received_amount: 400, amount_paid: 100 })
    ).toMatchObject({ committed: 400, released: 600, owed: 300, payableNow: 300, awaitingDelivery: 0 });
  });

  it("summarizes the page: committed → payable → paid, plus approval queue and cancelled", () => {
    const now = new Date(2026, 9, 6);
    const summary = summarizePurchaseOrders(
      [
        { status: "draft", total_amount: 500 },
        { status: "pending_approval", total_amount: 900 },
        { status: "approved", total_amount: 10000, received_amount: 0, amount_paid: 0, due_date: "2026-11-05" },
        { status: "partially_received", total_amount: 12350, received_amount: 10000, amount_paid: 5000, due_date: "2026-10-01" },
        { status: "received", total_amount: 2500, received_amount: 2500, amount_paid: 2500 },
        { status: "cancelled", total_amount: 800, received_amount: 0, amount_paid: 0 },
      ],
      { now }
    );
    expect(summary).toMatchObject({
      committed: 24850,
      committedOpen: 12350,
      payableNow: 5000,
      paid: 7500,
      owed: 17350,
      received: 12500,
      awaitingDelivery: 12350,
      overdue: 7350,
      overdueCount: 1,
      dueNext30: 17350, // 5 Nov is day 30: inside the window
      cancelled: 800,
      draftCount: 1,
      draftValue: 500,
      pendingApprovalCount: 1,
      pendingApprovalValue: 900,
    });
    // The three states always add back up to what was committed.
    expect(summary.committedOpen + summary.payableNow + summary.paid).toBe(summary.committed);
  });

  it("pending approval is not committed spend", () => {
    expect(purchaseOrderFinancials({ status: "pending_approval", total_amount: 900 })).toMatchObject({ committed: 0, owed: 0 });
  });
});

describe("payment terms and due dates (mirror public.purchase_order_due_date)", () => {
  it("net terms count calendar days from the order date, across month ends", () => {
    expect(purchaseOrderDueDate({ code: "net_30", orderDate: "2026-10-06" })).toBe("2026-11-05");
    expect(purchaseOrderDueDate({ code: "net_7", orderDate: "2026-12-28" })).toBe("2027-01-04");
    expect(purchaseOrderDueDate({ code: "net_15", orderDate: "2026-02-20" })).toBe("2026-03-07");
  });

  it("due on receipt uses expected delivery, custom uses the entered date", () => {
    expect(purchaseOrderDueDate({ code: "due_on_receipt", orderDate: "2026-10-06", expectedDate: "2026-10-20" })).toBe("2026-10-20");
    expect(purchaseOrderDueDate({ code: "due_on_receipt", orderDate: "2026-10-06" })).toBe("2026-10-06");
    expect(purchaseOrderDueDate({ code: "custom", orderDate: "2026-10-06", customDueDate: "2026-12-01" })).toBe("2026-12-01");
    expect(purchaseOrderDueDate({ code: "custom", orderDate: "2026-10-06" })).toBeNull();
  });

  it("maps supplier free-text terms", () => {
    expect(paymentTermsCodeFromText("COD")).toBe("due_on_receipt");
    expect(paymentTermsCodeFromText("15 days")).toBe("net_15");
    expect(paymentTermsCodeFromText("45 days EOM")).toBe("net_30");
    expect(paymentTermsCodeFromText("")).toBe("net_30");
  });
});

describe("cash-flow planning from approved purchase orders", () => {
  const now = new Date(2026, 9, 6);
  const pos = [
    { id: "a", po_number: "PO-1", status: "approved", total_amount: 10000, received_amount: 0, amount_paid: 0, due_date: "2026-11-05" },
    { id: "b", po_number: "PO-2", status: "received", total_amount: 3000, received_amount: 3000, amount_paid: 1000, due_date: "2026-09-30" },
    { id: "c", po_number: "PO-3", status: "approved", total_amount: 4000, received_amount: 0, amount_paid: 0, due_date: "2026-12-20" },
    { id: "d", po_number: "PO-4", status: "pending_approval", total_amount: 9999, due_date: "2026-10-10" },
    { id: "e", po_number: "PO-5", status: "received", total_amount: 500, received_amount: 500, amount_paid: 500, due_date: "2026-10-10" },
  ];

  it("schedules each outstanding balance on its due date; overdue is expected today", () => {
    const schedule = purchaseOrderPaymentSchedule(pos, { now });
    expect(schedule.map((r) => [r.poNumber, r.date, r.amount, r.overdue])).toEqual([
      ["PO-2", "2026-10-06", 2000, true],
      ["PO-1", "2026-11-05", 10000, false],
      ["PO-3", "2026-12-20", 4000, false],
    ]);
  });

  it("R10,000 approved 6 Oct, due 5 Nov, unpaid: expected outflow inside the 30-day window", () => {
    const schedule = purchaseOrderPaymentSchedule(pos, { now });
    expect(supplierOutflowWithin(schedule, { now, windowDays: 30 })).toBe(12000);
    expect(supplierOutflowWithin(schedule, { now, windowDays: 7 })).toBe(2000);
  });
});

describe("financial status", () => {
  it("separates committed, received-unpaid, partially paid, paid and cancelled", () => {
    expect(purchaseOrderFinancialStatus({ status: "draft", total_amount: 10 })).toBe("not_committed");
    expect(purchaseOrderFinancialStatus({ status: "pending_approval", total_amount: 10 })).toBe("not_committed");
    expect(purchaseOrderFinancialStatus({ status: "approved", total_amount: 10000 })).toBe("committed");
    expect(purchaseOrderFinancialStatus({ status: "received", total_amount: 10000, received_amount: 10000 })).toBe("received");
    expect(purchaseOrderFinancialStatus({ status: "received", total_amount: 10000, received_amount: 10000, amount_paid: 4000 })).toBe("partially_paid");
    expect(purchaseOrderFinancialStatus({ status: "received", total_amount: 10000, received_amount: 10000, amount_paid: 10000 })).toBe("paid");
    expect(purchaseOrderFinancialStatus({ status: "cancelled", total_amount: 800 })).toBe("cancelled");
    expect(purchaseOrderFinancialStatus({ status: "cancelled", total_amount: 800, received_amount: 300 })).toBe("received");
  });

  it("accepts due dates as Date objects as well as ISO strings", () => {
    const f = purchaseOrderFinancials(
      { status: "approved", total_amount: 100, due_date: new Date(2026, 10, 5) },
      { now: new Date(2026, 9, 6) }
    );
    expect([f.dueDate, f.daysUntilDue]).toEqual(["2026-11-05", 30]);
  });
});
