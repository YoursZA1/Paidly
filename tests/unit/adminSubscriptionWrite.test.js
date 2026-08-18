import { describe, expect, it } from "vitest";
import {
  buildAdminSubscriptionWriteRow,
  normalizeAdminSubscriptionListRow,
} from "../../server/src/billing/adminBillingApi.js";

describe("buildAdminSubscriptionWriteRow", () => {
  it("maps catalog starter + yearly to family slug and annual cycle", () => {
    const row = buildAdminSubscriptionWriteRow(
      {
        user_id: "11111111-2222-4333-a444-555555555555",
        email: "owner@example.com",
        user_name: "Ada",
        plan: "starter",
        amount: 50,
        billing_cycle: "yearly",
        status: "paused",
      },
      { isCreate: true }
    );
    expect(row.plan).toBe("starter");
    expect(row.plan_slug).toBe("starter_annual");
    expect(row.plan_family).toBe("starter");
    expect(row.billing_cycle).toBe("annual");
    expect(row.status).toBe("suspended");
    expect(row.amount).toBe(50);
    expect(row.email).toBe("owner@example.com");
  });

  it("keeps grandfathered individual slug", () => {
    const row = buildAdminSubscriptionWriteRow(
      {
        email: "legacy@example.com",
        plan: "individual",
        amount: 25,
        billing_cycle: "monthly",
        status: "active",
      },
      { isCreate: true }
    );
    expect(row.plan).toBe("individual");
    expect(row.plan_slug).toBe("individual");
    expect(row.plan_family).toBe("starter");
    expect(row.amount).toBe(25);
  });

  it("rejects writes without email on create", () => {
    expect(() =>
      buildAdminSubscriptionWriteRow({ plan: "starter" }, { isCreate: true })
    ).toThrow(/email is required/);
  });
});

describe("normalizeAdminSubscriptionListRow", () => {
  it("fills display fields from email/full_name", () => {
    const n = normalizeAdminSubscriptionListRow({
      id: "1",
      email: "a@b.com",
      full_name: "Pat",
      plan_slug: "business_monthly",
      amount: "150",
      created_at: "2026-08-01T00:00:00.000Z",
    });
    expect(n.user_email).toBe("a@b.com");
    expect(n.user_name).toBe("Pat");
    expect(n.plan).toBe("business_monthly");
    expect(n.amount).toBe(150);
    expect(n.created_date).toBe("2026-08-01T00:00:00.000Z");
  });
});
