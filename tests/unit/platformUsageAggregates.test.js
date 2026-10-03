import { describe, expect, it } from "vitest";
import {
  invoiceStatusRows,
  posUsageRows,
  saasLedgerRows,
} from "../../shared/admin/platformUsageAggregates.js";

describe("platform usage aggregates", () => {
  it("lists invoice statuses without a business or invoice", () => {
    const rows = invoiceStatusRows([
      { status: "paid", status_count: 12 },
      { status: "sent", status_count: 3 },
    ]);
    const json = JSON.stringify(rows);
    expect(rows.map((row) => row.title)).toEqual(["Paid", "Sent"]);
    expect(json).not.toMatch(/org_id|business|INV-/);
  });

  it("lists POS status and method counts without a sale or business", () => {
    const rows = posUsageRows([
      { status: "completed", payment_method: "cash", sale_count: 4 },
      { status: "completed", payment_method: "card", sale_count: 1 },
    ]);
    expect(rows.find((row) => row.id === "pos-status-completed").count).toBe(5);
    expect(rows.find((row) => row.id === "pos-method-cash").count).toBe(4);
    expect(JSON.stringify(rows)).not.toMatch(/org_id|business/);
  });

  it("sums SaaS payments by status and hides volume unless allowed", () => {
    const buckets = [
      { payment_status: "completed", payment_method: "payfast", currency: "ZAR", payment_count: 2, amount_sum: 598, company_id: "secret" },
    ];
    const hidden = saasLedgerRows(buckets, { includeAmounts: false });
    expect(hidden[0].count).toBe(2);
    expect(hidden[0]).not.toHaveProperty("amount");
    expect(JSON.stringify(hidden)).not.toContain("secret");

    const visible = saasLedgerRows(buckets, { includeAmounts: true });
    expect(visible[0].amount).toBe(598);
    expect(JSON.stringify(visible)).not.toContain("secret");
  });
});
