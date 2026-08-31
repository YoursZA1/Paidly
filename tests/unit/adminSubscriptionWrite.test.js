import { describe, expect, it } from "vitest";
import {
  buildAdminSubscriptionWriteRow,
  normalizeAdminSubscriptionListRow,
} from "../../server/src/billing/adminBillingApi.js";

describe("buildAdminSubscriptionWriteRow", () => {
  it("maps catalog starter + yearly to family slug and annual catalog amount", () => {
    const row = buildAdminSubscriptionWriteRow(
      {
        user_id: "11111111-2222-4333-a444-555555555555",
        email: "owner@example.com",
        user_name: "Ada",
        plan: "starter",
        amount: 500,
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
    expect(row.amount).toBe(500);
    expect(row.email).toBe("owner@example.com");
  });

  it("rejects grandfathered individual as an assignable plan", () => {
    expect(() =>
      buildAdminSubscriptionWriteRow(
        {
          email: "legacy@example.com",
          plan: "individual",
          amount: 25,
          billing_cycle: "monthly",
          status: "active",
        },
        { isCreate: true }
      )
    ).toThrow(/current Paidly catalog plan/);
  });

  it("rejects sme, corporate, and grandfathered plan ids", () => {
    for (const plan of ["sme", "corporate", "grandfathered", "legacy_plan"]) {
      expect(() =>
        buildAdminSubscriptionWriteRow(
          { email: "x@example.com", plan, amount: 50, billing_cycle: "monthly" },
          { isCreate: true }
        )
      ).toThrow(/current Paidly catalog plan/);
    }
  });

  it("rejects amount tampering on a fixed-price plan", () => {
    expect(() =>
      buildAdminSubscriptionWriteRow(
        {
          email: "x@example.com",
          plan: "starter",
          amount: 350,
          billing_cycle: "monthly",
        },
        { isCreate: true }
      )
    ).toThrow(/canonical catalog price/);
  });

  it("rejects Enterprise with a Growth list price", () => {
    expect(() =>
      buildAdminSubscriptionWriteRow(
        {
          email: "x@example.com",
          plan: "enterprise",
          amount: 350,
          billing_cycle: "monthly",
        },
        { isCreate: true }
      )
    ).toThrow(/custom/);
  });

  it("assigns Growth at R350 from the catalog", () => {
    const row = buildAdminSubscriptionWriteRow(
      {
        email: "x@example.com",
        plan: "growth",
        billing_cycle: "monthly",
      },
      { isCreate: true }
    );
    expect(row.plan).toBe("growth");
    expect(row.plan_slug).toBe("growth_monthly");
    expect(row.amount).toBe(350);
  });

  it("assigns Enterprise as custom with amount 0", () => {
    const row = buildAdminSubscriptionWriteRow(
      {
        email: "x@example.com",
        plan: "enterprise",
        amount: 0,
        billing_cycle: "monthly",
      },
      { isCreate: true }
    );
    expect(row.plan).toBe("enterprise");
    expect(row.plan_slug).toBe("enterprise_custom");
    expect(row.amount).toBe(0);
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
    expect(n.needs_plan_migration).toBe(false);
  });

  it("flags stored grandfathered slugs for admin migration", () => {
    const n = normalizeAdminSubscriptionListRow({
      id: "2",
      email: "old@example.com",
      plan: "individual",
      amount: 25,
    });
    expect(n.plan).toBe("individual");
    expect(n.needs_plan_migration).toBe(true);
    expect(n.amount).toBe(25);
  });
});
