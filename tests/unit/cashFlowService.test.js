import { describe, expect, it } from "vitest";
import { startOfMonth, endOfMonth } from "date-fns";
import { CashFlowService } from "@/services/CashFlowService";

describe("CashFlowService.calculatePeriodCashFlow", () => {
  it("uses calendar days so late-month expenses are not dropped", () => {
    const start = startOfMonth(new Date("2026-08-15T12:00:00"));
    const end = endOfMonth(new Date("2026-08-15T12:00:00"));
    const result = CashFlowService.calculatePeriodCashFlow(
      [{ id: "p1", amount: 200, status: "completed", paid_at: "2026-08-31" }],
      [
        { id: "e1", amount: 30, date: "2026-08-01" },
        { id: "e2", amount: 10, created_at: "2026-08-12T22:00:00" },
        { id: "e3", amount: 99, date: "2026-08-10", approval_status: "rejected" },
      ],
      start,
      end,
      []
    );
    expect(result.income).toBe(200);
    expect(result.expenses).toBe(40);
    expect(result.net).toBe(160);
  });

  it("includes paid invoices that have no payment rows", () => {
    const start = startOfMonth(new Date("2026-08-15T12:00:00"));
    const end = endOfMonth(new Date("2026-08-15T12:00:00"));
    const result = CashFlowService.calculatePeriodCashFlow(
      [],
      [],
      start,
      end,
      [{ id: "inv-b", status: "paid", total_amount: 80, invoice_date: "2026-08-03" }]
    );
    expect(result.income).toBe(80);
  });

  it("does not treat missing expense.date as fatal when created_at exists", () => {
    const validation = CashFlowService.validateData(
      [{ amount: 10, paid_at: "2026-08-01" }],
      [{ amount: 5, created_at: "2026-08-02" }]
    );
    expect(validation.isValid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });
});
