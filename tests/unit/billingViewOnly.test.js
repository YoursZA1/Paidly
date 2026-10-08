import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingViewOnlyMessage, labelIsBillingWrite } from "../../shared/billingViewOnly.js";

describe("billing view-only", () => {
  it("uses trial wording only for an ended trial", () => {
    expect(billingViewOnlyMessage("expired")).toMatch(/trial has ended/i);
    expect(billingViewOnlyMessage("suspended")).toMatch(/subscription is not active/i);
  });

  it("treats create, edit, send, and delete as writes, and download as a view", () => {
    expect(labelIsBillingWrite("Create invoice")).toBe(true);
    expect(labelIsBillingWrite("Save")).toBe(true);
    expect(labelIsBillingWrite("Send")).toBe(true);
    expect(labelIsBillingWrite("Delete")).toBe(true);
    expect(labelIsBillingWrite("Record payment")).toBe(true);
    expect(labelIsBillingWrite("Download PDF")).toBe(false);
    expect(labelIsBillingWrite("Clear filters")).toBe(false);
    expect(labelIsBillingWrite("Cancel")).toBe(false);
  });

  it("guards updates and deletes on business tables once the subscription lapses", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20261008180000_lapsed_subscription_view_only.sql", import.meta.url),
      "utf8"
    );
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.%I/);
    expect(sql).toMatch(/paidly_assert_subscription_access/);
    expect(sql).toMatch(/SUBSCRIPTION_REQUIRED:view_only/);
    expect(sql).not.toMatch(/ARRAY\['invoice_views'/);
  });
});
