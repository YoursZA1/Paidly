import { describe, expect, it } from "vitest";
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
});
