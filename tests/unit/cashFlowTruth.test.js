import { describe, expect, it } from "vitest";
import {
  buildCashFlowChartRows,
  buildCashFlowSnapshot,
  buildCashLedger,
  buildMoneyTotals,
  collectIncomeEvents,
  collectPayrollEvents,
  ledgerRowMatchesFilters,
  getReportPeriodBounds,
  inDayRange,
  isCashExpense,
  isSettledPayment,
  outstandingInvoiceAmount,
} from "@/utils/cashFlowTruth";

describe("cashFlowTruth", () => {
  it("treats paid_at as a payment date and ignores pending payments", () => {
    expect(isSettledPayment({ amount: 100, status: "completed", paid_at: "2026-08-01" })).toBe(true);
    expect(isSettledPayment({ amount: 100, status: "pending", paid_at: "2026-08-01" })).toBe(false);
    expect(isSettledPayment({ amount: 0, status: "completed" })).toBe(false);
  });

  it("includes paid invoices that have no payment rows", () => {
    const events = collectIncomeEvents(
      [{ id: "p1", invoice_id: "inv-a", amount: 50, status: "completed", paid_at: "2026-08-02" }],
      [
        { id: "inv-a", status: "paid", total_amount: 50, invoice_number: "1" },
        { id: "inv-b", status: "paid", total_amount: 80, invoice_number: "2", invoice_date: "2026-08-03" },
      ]
    );
    expect(events).toHaveLength(2);
    expect(events.find((row) => row.invoiceId === "inv-b")?.amount).toBe(80);
  });

  it("does not double-count a paid invoice that already has payments", () => {
    const events = collectIncomeEvents(
      [{ id: "p1", invoice_id: "inv-a", amount: 50, status: "completed", paid_at: "2026-08-02" }],
      [{ id: "inv-a", status: "paid", total_amount: 50 }]
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(50);
  });

  it("does not treat a POS tax-invoice copy as cash-flow income", () => {
    const events = collectIncomeEvents(
      [{ id: "p-pos", invoice_id: "inv-pos", amount: 90, status: "completed", paid_at: "2026-08-02" }],
      [{ id: "inv-pos", status: "paid", total_amount: 90, invoice_number: "INV-POS-1", pos_sale_event_id: "sale-1" }]
    );
    expect(events).toHaveLength(0);
  });

  it("computes outstanding as invoice total minus settled payments", () => {
    expect(
      outstandingInvoiceAmount(
        { id: "inv-a", total_amount: 100, status: "partial_paid" },
        [{ invoice_id: "inv-a", amount: 40, status: "completed" }]
      )
    ).toBe(60);
  });

  it("builds monthly income to expense snapshot without mixing last month", () => {
    const snap = buildCashFlowSnapshot({
      now: new Date("2026-08-15T12:00:00"),
      payments: [
        { id: "p1", amount: 200, status: "completed", paid_at: "2026-08-10" },
        { id: "p2", amount: 90, status: "completed", paid_at: "2026-07-20" },
      ],
      expenses: [
        { id: "e1", amount: 30, date: "2026-08-12" },
        { id: "e2", amount: 10, date: "2026-07-02", approval_status: "rejected" },
      ],
      invoices: [{ id: "inv-open", status: "sent", total_amount: 400, delivery_date: "2026-08-20" }],
    });
    expect(snap.monthlyIncome).toBe(200);
    expect(snap.monthlyExpenses).toBe(30);
    expect(snap.netCashFlow).toBe(170);
    expect(snap.prevIncome).toBe(90);
    expect(snap.currentBalance).toBe(260);
    expect(snap.outstandingTotal).toBe(400);
  });

  it("orders the ledger from newest income through expenses on the same day", () => {
    const rows = buildCashLedger({
      incomeEvents: [{ id: "in", kind: "income", date: "2026-08-10", amount: 1, name: "In" }],
      expenseEvents: [{ id: "out", kind: "expense", date: "2026-08-10", amount: 1, name: "Out" }],
      filter: "all",
    });
    expect(rows.map((r) => r.kind)).toEqual(["income", "expense"]);
  });

  it("charts the last N calendar days instead of days from the 1st of the month", () => {
    const rows = buildCashFlowChartRows({
      timeRange: "7D",
      now: new Date("2026-08-15T12:00:00"),
      incomeEvents: [{ date: "2026-08-15", amount: 10 }],
      expenseEvents: [{ date: "2026-08-09", amount: 4 }],
    });
    expect(rows).toHaveLength(7);
    expect(rows[0].expenses).toBe(4);
    expect(rows[6].income).toBe(10);
  });

  it("includes the start and end calendar day of a range", () => {
    const start = new Date("2026-08-01T00:00:00");
    const end = new Date("2026-08-31T00:00:00");
    expect(inDayRange("2026-08-01", start, end)).toBe(true);
    expect(inDayRange("2026-08-31", start, end)).toBe(true);
    expect(inDayRange("2026-07-31", start, end)).toBe(false);
  });

  it("excludes rejected expenses from cash spending", () => {
    expect(isCashExpense({ amount: 40, date: "2026-08-12" })).toBe(true);
    expect(isCashExpense({ amount: 40, date: "2026-08-12", approval_status: "rejected" })).toBe(false);
    expect(isCashExpense({ amount: 0, date: "2026-08-12" })).toBe(false);
  });

  it("treats quarter as the current calendar quarter, not a rolling 3 months", () => {
    const { start, end } = getReportPeriodBounds("quarter", new Date("2026-08-28T12:00:00"));
    expect(inDayRange("2026-07-01", start, end)).toBe(true);
    expect(inDayRange("2026-09-30", start, end)).toBe(true);
    expect(inDayRange("2026-06-30", start, end)).toBe(false);
    expect(inDayRange("2026-05-28", start, end)).toBe(false);
  });

  it("includes POS till sales in report money totals without double-counting tax-invoice copies", () => {
    const { start, end } = getReportPeriodBounds("month", new Date("2026-08-15T12:00:00"));
    const totals = buildMoneyTotals({
      start,
      end,
      payments: [],
      invoices: [{ id: "inv-pos", status: "paid", total_amount: 90, pos_sale_event_id: "s1", invoice_date: "2026-08-10" }],
      expenses: [],
      posSales: [{
        id: "s1",
        sale_kind: "sale",
        status: "completed",
        total_amount: 90,
        payment_method: "cash",
        occurred_at: "2026-08-10T12:00:00.000Z",
        items: [],
        raw_payload: { subtotal: 90, discount_amount: 0, tax_amount: 0 },
      }],
    });
    expect(totals.income).toBe(90);
  });

  it("builds report money totals from settled payments, not invoice totals", () => {
    const { start, end } = getReportPeriodBounds("month", new Date("2026-08-15T12:00:00"));
    const totals = buildMoneyTotals({
      start,
      end,
      payments: [
        { id: "p1", invoice_id: "inv-a", amount: 40, status: "completed", paid_at: "2026-08-10" },
        { id: "p2", amount: 100, status: "pending", paid_at: "2026-08-11" },
      ],
      invoices: [{ id: "inv-a", status: "partial_paid", total_amount: 100 }],
      expenses: [
        { id: "e1", amount: 25, date: "2026-08-12" },
        { id: "e2", amount: 80, date: "2026-08-13", approval_status: "rejected" },
        { id: "e3", amount: 10, date: "2026-07-02" },
      ],
    });
    expect(totals.income).toBe(40);
    expect(totals.expenses).toBe(25);
    expect(totals.profit).toBe(15);
  });

  it("filters the transaction ledger by search, category, amount, and date", () => {
    const rows = [
      { kind: "income", name: "Payment received", category: "eft", amount: 13200, date: "2026-10-08" },
      { kind: "expense", name: "Snack For Meeting", category: "office", vendor: "Cafe", amount: 120, date: "2026-10-08", expense: { category: "office", description: "Snack For Meeting", payment_method: "cash" } },
      { kind: "expense", name: "New Tie", category: "travel", amount: 100, date: "2026-09-01", expense: { category: "travel", description: "New Tie" } },
    ];
    expect(rows.filter((row) => ledgerRowMatchesFilters(row, { search: "snack" }))).toHaveLength(1);
    expect(rows.filter((row) => ledgerRowMatchesFilters(row, { category: "office" }))).toHaveLength(1);
    expect(rows.filter((row) => ledgerRowMatchesFilters(row, { amountRange: "5000+" }))).toHaveLength(1);
    expect(rows.filter((row) => ledgerRowMatchesFilters(row, { dateFrom: "2026-10-01", dateTo: "2026-10-08" }))).toHaveLength(2);
    const standing = buildMoneyTotals({
      payments: [{ id: "p1", amount: 13200, status: "completed", paid_at: "2026-10-08" }],
      expenses: [
        { id: "e1", amount: 120, date: "2026-10-08", category: "office" },
        { id: "e-salary", amount: 8000, date: "2026-10-25", category: "salary" },
      ],
      payslips: [
        { id: "s1", pay_run_id: "run-1", employee_name: "A", net_pay: 7000, pay_date: "2026-10-25", status: "draft", locked: true },
        { id: "s-draft", employee_name: "B", net_pay: 9000, pay_date: "2026-10-25", status: "draft", locked: false },
      ],
      payRuns: [{
        id: "run-1",
        period_label: "October 2026",
        pay_date: "2026-10-25",
        status: "paid",
        finalized_at: "2026-10-25T08:00:00Z",
        net_total: 7000,
        bank_payment_amount: 7000,
        bank_payment_expense_ids: ["e-salary"],
      }],
      start: new Date("2026-10-01T00:00:00"),
      end: new Date("2026-10-31T00:00:00"),
    });
    expect(standing.payroll).toBe(7000);
    expect(standing.expenses).toBe(7120);
    expect(standing.profit).toBe(6080);
    expect(collectPayrollEvents({
      payslips: [{ id: "s2", employee_name: "A", net_pay: 5000, pay_date: "2026-10-25", status: "published" }],
    })[0].name).toBe("Payroll — A");
    expect(collectPayrollEvents({
      payslips: [{ id: "s3", employee_name: "B", net_pay: 9000, pay_date: "2026-10-25", status: "draft", locked: false }],
    })).toHaveLength(0);

    expect(collectIncomeEvents(
      [{ id: "p1", invoice_id: "inv-1", amount: 10, status: "completed", reference: "83ce79ba-a98d-42d7-a8e2-ca399c450bb8", paid_at: "2026-10-08" }],
      [{ id: "inv-1", client_name: "ABC Trading", invoice_number: "INV-1002", status: "paid" }]
    )[0].name).toBe("ABC Trading — INV-1002");
  });
});
