import { describe, expect, it } from "vitest";
import { differenceInCalendarDays, startOfDay, startOfMonth } from "date-fns";
import { computeDashboardRevenue } from "@/lib/dashboard/revenueComposition";

const now = new Date("2026-09-08T12:00:00Z");

describe("computeDashboardRevenue", () => {
  it("keeps quotes out of realized revenue", () => {
    const result = computeDashboardRevenue({
      now,
      rangeDays: 30,
      invoices: [
        {
          id: "inv-1",
          status: "paid",
          total_amount: 1000,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      quotes: [
        { id: "q1", status: "sent", total_amount: 500, created_at: "2026-09-02T00:00:00Z" },
        { id: "q2", status: "draft", total_amount: 900, created_at: "2026-09-02T00:00:00Z" },
      ],
    });
    expect(result.invoices).toBe(1000);
    expect(result.realized).toBe(1000);
    expect(result.quotes).toBe(500);
    expect(result.pipeline).toBe(1500);
  });

  it("reconciles realized as invoices + POS + other", () => {
    const result = computeDashboardRevenue({
      now,
      rangeDays: 30,
      invoices: [
        {
          id: "inv-1",
          status: "paid",
          total_amount: 250,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      payments: [
        {
          id: "pay-other",
          amount: 40,
          status: "completed",
          paid_at: "2026-09-03T00:00:00Z",
        },
      ],
      posSales: [
        {
          id: "pos-1",
          status: "completed",
          sale_kind: "sale",
          total_amount: 80,
          occurred_at: "2026-09-04T00:00:00Z",
        },
      ],
    });
    expect(result.invoices).toBe(250);
    expect(result.pos).toBe(80);
    expect(result.other).toBe(40);
    expect(result.realized).toBe(370);
    expect(result.realized).toBe(result.invoices + result.pos + result.other);
  });

  it("does not count POS tax-invoice copies as invoice revenue", () => {
    const result = computeDashboardRevenue({
      now,
      rangeDays: 30,
      invoices: [
        {
          id: "inv-pos",
          status: "paid",
          total_amount: 80,
          created_at: "2026-09-04T00:00:00Z",
          pos_sale_event_id: "pos-1",
        },
      ],
      posSales: [
        {
          id: "pos-1",
          status: "completed",
          sale_kind: "sale",
          total_amount: 80,
          occurred_at: "2026-09-04T00:00:00Z",
          invoice_id: "inv-pos",
        },
      ],
    });
    expect(result.invoices).toBe(0);
    expect(result.pos).toBe(80);
    expect(result.realized).toBe(80);
  });

  it("does not invent a trend when the prior period is zero", () => {
    const result = computeDashboardRevenue({
      now,
      rangeDays: 30,
      invoices: [
        {
          id: "inv-1",
          status: "paid",
          total_amount: 100,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    });
    expect(result.trend).toBeNull();
  });

  it("does not treat unpaid invoices as realized revenue", () => {
    const result = computeDashboardRevenue({
      now,
      period: "month",
      invoices: [
        {
          id: "open",
          status: "sent",
          total_amount: 9999,
          created_at: "2026-09-02T00:00:00Z",
        },
      ],
      payments: [],
    });
    expect(result.realized).toBe(0);
  });

  it("uses calendar month vs the equivalent prior-month days", () => {
    const result = computeDashboardRevenue({
      now,
      period: "month",
      payments: [
        { id: "now", amount: 1000, status: "completed", paid_at: "2026-09-02T00:00:00Z" },
        { id: "prior", amount: 800, status: "completed", paid_at: "2026-08-03T00:00:00Z" },
        { id: "too-old", amount: 5000, status: "completed", paid_at: "2026-08-20T00:00:00Z" },
      ],
    });
    expect(result.realized).toBe(1000);
    expect(result.realizedPrevious).toBe(800);
    expect(result.trend.text).toBe("+25% vs last month");
    expect(result.chart).toHaveLength(differenceInCalendarDays(startOfDay(now), startOfMonth(now)) + 1);
  });

  it("uses calendar year-to-date vs last year-to-date", () => {
    const result = computeDashboardRevenue({
      now,
      period: "year",
      payments: [
        { id: "ytd-late", amount: 1000, status: "completed", paid_at: "2026-09-02T00:00:00Z" },
        { id: "ytd-early", amount: 500, status: "completed", paid_at: "2026-03-01T00:00:00Z" },
        { id: "last-ytd", amount: 800, status: "completed", paid_at: "2025-03-01T00:00:00Z" },
        { id: "last-year-after", amount: 9000, status: "completed", paid_at: "2025-11-01T00:00:00Z" },
      ],
    });
    expect(result.realized).toBe(1500);
    expect(result.realizedPrevious).toBe(800);
    expect(result.trend.text).toBe("+88% vs last year");
    expect(result.chart.map((row) => row.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
    ]);
  });
});
