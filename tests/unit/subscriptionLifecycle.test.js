import { describe, expect, it } from "vitest";
import {
  PAYMENT_REPORTING_START_ISO,
  TRIAL_DURATION_DAYS,
  addCalendarDaysIso,
  describeAccessFacingState,
  hasSubscriptionAccess,
  isAdminManaged,
  pickAccessSubscriptionRow,
  shouldExpireTrialRow,
  trialEndFromStart,
  trialDaysRemaining,
} from "../../shared/subscriptionAccess.js";
import {
  getRevenueSince,
  paymentCountsTowardRevenue,
  reportingPaymentLabel,
} from "../../shared/billingReporting.js";
import { buildAdminOverridePatch } from "../../server/src/billing/adminSubscriptionOverride.js";

describe("trial dates", () => {
  it("adds exactly 7 calendar days in UTC", () => {
    const start = "2026-08-20T14:30:00.000Z";
    expect(trialEndFromStart(start)).toBe("2026-08-27T14:30:00.000Z");
    expect(TRIAL_DURATION_DAYS).toBe(7);
    expect(addCalendarDaysIso(start, 7)).toBe("2026-08-27T14:30:00.000Z");
  });
});

describe("hasSubscriptionAccess", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("allows trialing before trial_ends_at", () => {
    expect(
      hasSubscriptionAccess(
        { status: "trialing", trial_ends_at: "2026-08-27T14:30:00.000Z" },
        now
      )
    ).toBe(true);
  });

  it("denies trialing after trial_ends_at even if cron has not run", () => {
    expect(
      hasSubscriptionAccess(
        { status: "trialing", trial_ends_at: "2026-08-21T00:00:00.000Z" },
        now
      )
    ).toBe(false);
    expect(
      shouldExpireTrialRow(
        { status: "trialing", trial_ends_at: "2026-08-21T00:00:00.000Z" },
        now
      )
    ).toBe(true);
  });

  it("allows active paid subscriptions", () => {
    expect(hasSubscriptionAccess({ status: "active" }, now)).toBe(true);
  });

  it("allows admin-managed trialing past the original end", () => {
    const sub = {
      status: "trialing",
      trial_ends_at: "2026-08-21T00:00:00.000Z",
      admin_override: true,
      subscription_source: "admin",
    };
    expect(isAdminManaged(sub)).toBe(true);
    expect(hasSubscriptionAccess(sub, now)).toBe(true);
    expect(shouldExpireTrialRow(sub, now)).toBe(false);
  });

  it("allows admin grant mapped as active + admin source", () => {
    expect(
      hasSubscriptionAccess(
        { status: "active", subscription_source: "admin", admin_override: true },
        now
      )
    ).toBe(true);
  });

  it("denies admin suspension", () => {
    expect(
      hasSubscriptionAccess(
        { status: "suspended", admin_override: true, subscription_source: "admin" },
        now
      )
    ).toBe(false);
  });

  it("does not treat pending checkout as access", () => {
    expect(hasSubscriptionAccess({ status: "pending" }, now)).toBe(false);
  });

  it("does not treat failed as access", () => {
    expect(hasSubscriptionAccess({ status: "failed" }, now)).toBe(false);
  });
});

describe("pickAccessSubscriptionRow", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("prefers a valid trial over a newer pending checkout", () => {
    const picked = pickAccessSubscriptionRow(
      [
        {
          id: "pending",
          status: "pending",
          updated_at: "2026-08-22T11:00:00.000Z",
        },
        {
          id: "trial",
          status: "trialing",
          trial_ends_at: "2026-08-27T00:00:00.000Z",
          updated_at: "2026-08-20T00:00:00.000Z",
        },
      ],
      now
    );
    expect(picked.id).toBe("trial");
  });
});

describe("payment reporting epoch 2026-08-20", () => {
  it("excludes successful payments before the cutoff", () => {
    const row = {
      payment_status: "completed",
      amount: 50,
      transaction_date: "2026-08-19T23:59:59.000Z",
    };
    expect(paymentCountsTowardRevenue(row, PAYMENT_REPORTING_START_ISO)).toBe(false);
  });

  it("includes successful payments on/after the cutoff", () => {
    const row = {
      payment_status: "completed",
      amount: 150,
      transaction_date: "2026-08-20T00:00:00.000Z",
    };
    expect(paymentCountsTowardRevenue(row, PAYMENT_REPORTING_START_ISO)).toBe(true);
  });

  it("excludes pending and failed from revenue", () => {
    expect(
      paymentCountsTowardRevenue(
        { payment_status: "pending", amount: 50, transaction_date: "2026-08-21T00:00:00.000Z" },
        PAYMENT_REPORTING_START_ISO
      )
    ).toBe(false);
    expect(
      paymentCountsTowardRevenue(
        { payment_status: "failed", amount: 50, transaction_date: "2026-08-21T00:00:00.000Z" },
        PAYMENT_REPORTING_START_ISO
      )
    ).toBe(false);
    expect(reportingPaymentLabel({ payment_status: "completed" })).toBe("SUCCESSFUL");
    expect(reportingPaymentLabel({ payment_status: "failed" })).toBe("FAILED");
  });

  it("sums only successful in-window rows", () => {
    const { count, amount } = getRevenueSince(
      [
        { payment_status: "completed", amount: 50, transaction_date: "2026-08-19T00:00:00.000Z" },
        { payment_status: "completed", amount: 150, transaction_date: "2026-08-20T00:00:00.000Z" },
        { payment_status: "failed", amount: 350, transaction_date: "2026-08-21T00:00:00.000Z" },
        { payment_status: "completed", amount: 50, created_at: "2026-08-22T00:00:00.000Z" },
      ],
      PAYMENT_REPORTING_START_ISO
    );
    expect(count).toBe(2);
    expect(amount).toBe(200);
  });
});

describe("admin override patch", () => {
  const existing = {
    status: "trialing",
    trial_ends_at: "2026-08-27T14:30:00.000Z",
    plan: "starter",
    plan_slug: "starter_monthly",
  };
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("extends trial without letting automation own the row", () => {
    const { patch, action, description } = buildAdminOverridePatch(
      existing,
      { action: "extend_trial", days: 14, reason: "Admin extended trial by 14 days" },
      { actorId: "admin-1", now }
    );
    expect(action).toBe("extend_trial");
    expect(patch.status).toBe("trialing");
    expect(patch.admin_override).toBe(true);
    expect(patch.subscription_source).toBe("admin");
    expect(patch.trial_ends_at).toBe("2026-09-10T14:30:00.000Z");
    expect(description).toMatch(/14 days/);
    expect(shouldExpireTrialRow({ ...existing, ...patch }, now)).toBe(false);
  });

  it("maps grant to active + admin source (not a new CHECK status)", () => {
    const { patch } = buildAdminOverridePatch(existing, { action: "grant" }, { now });
    expect(patch.status).toBe("active");
    expect(patch.admin_override).toBe(true);
    expect(hasSubscriptionAccess({ ...existing, ...patch }, now)).toBe(true);
  });

  it("maps suspend to suspended", () => {
    const { patch } = buildAdminOverridePatch(existing, { action: "suspend" }, { now });
    expect(patch.status).toBe("suspended");
    expect(hasSubscriptionAccess({ ...existing, ...patch }, now)).toBe(false);
  });
});

describe("user-facing copy", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");

  it("shows remaining trial days from trial_ends_at", () => {
    const d = describeAccessFacingState(
      { status: "trialing", trial_ends_at: "2026-08-27T12:00:00.000Z" },
      now
    );
    expect(d.headline).toBe("Free Trial");
    expect(d.detail).toBe("5 days remaining");
    expect(trialDaysRemaining("2026-08-27T12:00:00.000Z", now)).toBe(5);
  });
});
