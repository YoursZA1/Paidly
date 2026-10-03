import { describe, expect, it } from "vitest";
import {
  PAYMENT_INTENT_FINANCE_COLUMNS,
  buildPaymentIntentFinance,
  parseFinanceCustomRange,
  paymentIntentBucketFromRpc,
  paymentIntentFactFromRow,
} from "../../shared/admin/paymentIntentFinance.js";
import { normalizeAuditIntentId, normalizeAuditReason } from "../../server/src/adminPaymentIntentAudit.js";

const NOW = new Date("2026-10-04T10:00:00.000Z");

describe("payment intent finance", () => {
  it("does not select a business or intent id", () => {
    expect(PAYMENT_INTENT_FINANCE_COLUMNS.split(",").map((c) => c.trim())).not.toContain("org_id");
    expect(PAYMENT_INTENT_FINANCE_COLUMNS.split(",").map((c) => c.trim())).not.toContain("id");
  });

  it("drops business identity before aggregation", () => {
    const fact = paymentIntentFactFromRow({
      id: "intent-1",
      org_id: "org-1",
      source_kind: "pos",
      provider: "cash",
      amount: 1000,
      currency: "ZAR",
      status: "paid",
      created_at: "2026-10-04T08:00:00.000Z",
      metadata: { offline_method: "cash", customer_name: "Valet Cafe" },
    });
    expect(fact).not.toHaveProperty("id");
    expect(fact).not.toHaveProperty("org_id");
    expect(fact).not.toHaveProperty("metadata");
    expect(fact.offline_method).toBe("cash");
  });

  it("aggregates methods and products without per-business rows", () => {
    const facts = [
      paymentIntentFactFromRow({
        org_id: "a",
        source_kind: "pos",
        provider: "cash",
        amount: 1000,
        currency: "ZAR",
        status: "paid",
        created_at: "2026-10-04T08:00:00.000Z",
        metadata: { offline_method: "cash" },
      }),
      paymentIntentFactFromRow({
        org_id: "b",
        source_kind: "document",
        provider: "cash",
        amount: 250,
        currency: "ZAR",
        status: "failed",
        created_at: "2026-10-03T08:00:00.000Z",
        metadata: { offline_method: "eft" },
      }),
      paymentIntentFactFromRow({
        org_id: "a",
        source_kind: "document",
        provider: "ozow",
        amount: 80,
        currency: "ZAR",
        status: "paid",
        created_at: "2026-09-01T08:00:00.000Z",
        metadata: {},
      }),
    ];
    const finance = buildPaymentIntentFinance(facts, { includeAmounts: true, now: NOW });
    const serialized = JSON.stringify(finance);
    expect(serialized).not.toContain("org-");
    expect(serialized).not.toContain("Valet");
    expect(serialized).not.toContain("intent");
    expect(finance.amountsVisible).toBe(true);

    const today = finance.periods.today;
    expect(today.total).toBe(1);
    expect(today.successful).toBe(1);
    expect(today.methods.find((m) => m.key === "cash").count).toBe(1);
    expect(today.products.find((p) => p.key === "pos").count).toBe(1);
    expect(today.volume).toEqual([{ currency: "ZAR", amount: 1000 }]);

    const week = finance.periods["7d"];
    expect(week.total).toBe(2);
    expect(week.failed).toBe(1);
    expect(week.methods.find((m) => m.key === "eft").count).toBe(1);
    expect(week.volume).toEqual([{ currency: "ZAR", amount: 1000 }]);

    const all = finance.periods.all;
    expect(all.total).toBe(3);
    expect(all.products.find((p) => p.key === "invoice").count).toBe(2);
    expect(all.methods.find((m) => m.key === "digital").count).toBe(1);
    expect(all.volume).toEqual([{ currency: "ZAR", amount: 1080 }]);
  });

  it("omits money totals unless the caller is allowed to see volume", () => {
    const finance = buildPaymentIntentFinance(
      [
        paymentIntentFactFromRow({
          source_kind: "pos",
          provider: "cash",
          amount: 1000,
          currency: "ZAR",
          status: "paid",
          created_at: "2026-10-04T08:00:00.000Z",
        }),
      ],
      { includeAmounts: false, now: NOW }
    );
    expect(finance.amountsVisible).toBe(false);
    expect(finance.periods.today).not.toHaveProperty("volume");
    expect(finance.periods.today.methods[0]).not.toHaveProperty("volume");
    expect(JSON.stringify(finance)).not.toContain("1000");
  });

  it("builds the same totals from database buckets, without a business", () => {
    const finance = buildPaymentIntentFinance(
      [
        paymentIntentBucketFromRpc({
          day: "2026-10-04",
          method: "cash",
          product: "pos",
          provider: "cash",
          status: "paid",
          currency: "ZAR",
          intent_count: 3,
          amount_sum: 1500,
        }),
      ],
      { includeAmounts: true, now: NOW }
    );
    expect(finance.periods.today.total).toBe(3);
    expect(finance.periods.today.volume).toEqual([{ currency: "ZAR", amount: 1500 }]);
    expect(finance.periods.today.averageValue).toEqual([{ currency: "ZAR", amount: 500 }]);
    expect(finance.trend.find((day) => day.date === "2026-10-04").count).toBe(3);
    expect(JSON.stringify(finance)).not.toMatch(/org_id|business_name|client_name/);
  });

  it("accepts a date range and rejects a span longer than a year", () => {
    expect(parseFinanceCustomRange("2026-10-01", "2026-10-07")?.fromKey).toBe("2026-10-01");
    expect(parseFinanceCustomRange("2026-01-01", "2027-06-01")).toBeNull();
    expect(parseFinanceCustomRange("not-a-date", "2026-10-01")).toBeNull();
  });

  it("requires a real intent id and a reason before an investigation", () => {
    expect(normalizeAuditIntentId("not-an-id")).toBeNull();
    expect(normalizeAuditIntentId("22222222-2222-4222-8222-222222222222")).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
    expect(normalizeAuditReason("short")).toBeNull();
    expect(normalizeAuditReason("Failed payment dispute for support")).toBe("Failed payment dispute for support");
  });
});
