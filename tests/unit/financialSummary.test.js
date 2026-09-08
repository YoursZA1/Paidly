import { describe, expect, it } from "vitest";
import { buildTrend, computeDashboardFinancials } from "@/lib/dashboard/financialSummary";

describe("buildTrend", () => {
  it("returns null when the prior period is zero", () => {
    expect(buildTrend({ current: 100, previous: 0, periodLabel: "August 2026" })).toBeNull();
  });

  it("names the comparison period", () => {
    const trend = buildTrend({ current: 108.4, previous: 100, periodLabel: "August 2026" });
    expect(trend.text).toBe("+8.4% vs August 2026");
  });
});

describe("computeDashboardFinancials", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("does not treat paid invoices as outstanding", () => {
    const result = computeDashboardFinancials({
      now,
      invoices: [
        { id: "1", status: "paid", total_amount: 1000, created_at: "2026-09-01T00:00:00Z" },
        { id: "2", status: "sent", total_amount: 2500, created_at: "2026-08-15T00:00:00Z", delivery_date: "2026-09-30" },
        { id: "3", status: "draft", total_amount: 400, created_at: "2026-09-02T00:00:00Z" },
        { id: "4", status: "overdue", total_amount: 800, created_at: "2026-07-01T00:00:00Z", delivery_date: "2026-08-01" },
      ],
      quotes: [{ id: "q1", status: "draft" }],
    });
    expect(result.outstandingTotal).toBe(3300);
    expect(result.paidThisMonth).toBe(1000);
    expect(result.draftInvoiceCount).toBe(1);
    expect(result.draftQuoteCount).toBe(1);
    expect(result.overdueAmount).toBe(800);
  });
});
