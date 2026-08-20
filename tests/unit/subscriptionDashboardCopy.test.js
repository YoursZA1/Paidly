import { describe, expect, it } from "vitest";
import { trialRemainingBreakdown } from "../../shared/subscriptionAccess.js";
import {
  DASHBOARD_BANNER_KIND,
  describeDashboardSubscriptionBanner,
  formatTrialEndDate,
} from "../../shared/subscriptionDashboardCopy.js";

describe("formatTrialEndDate", () => {
  it("formats the server trial_ends_at timestamp, not account-created + 7", () => {
    expect(formatTrialEndDate("2026-08-27T19:00:00.000Z")).toBe("27 August 2026");
    expect(formatTrialEndDate("2026-09-10T14:30:00.000Z")).toBe("10 September 2026");
  });
});

describe("trialRemainingBreakdown", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");

  it("reports whole days when more than 24 hours remain", () => {
    const r = trialRemainingBreakdown("2026-08-27T19:00:00.000Z", now);
    expect(r.expired).toBe(false);
    expect(r.daysRemaining).toBe(7);
  });

  it("reports hours when less than 24 hours remain", () => {
    const r = trialRemainingBreakdown("2026-08-22T06:00:00.000Z", now);
    expect(r.expired).toBe(false);
    expect(r.daysRemaining).toBe(1);
    expect(r.hoursRemaining).toBe(18);
    expect(r.remainingMs).toBe(18 * 60 * 60 * 1000);
  });

  it("marks expired without returning a live countdown", () => {
    const r = trialRemainingBreakdown("2026-08-20T00:00:00.000Z", now);
    expect(r.expired).toBe(true);
    expect(r.daysRemaining).toBe(0);
  });
});

describe("describeDashboardSubscriptionBanner", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");

  it("shows a 7-day trial with the server end date", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-08-27T19:00:00.000Z",
        daysRemaining: 7,
      },
      now
    );
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.TRIALING);
    expect(copy.heading).toBe("You're on a 7-day free trial");
    expect(copy.supporting).toContain("27 August 2026");
    expect(copy.countdown).toBe("7 days remaining");
    expect(copy.ctaLabel).toBe("Choose a plan");
    expect(copy.ctaTo).toBe("subscription");
  });

  it("uses admin-extended trial_end_at instead of a hardcoded 7-day date", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-09-10T14:30:00.000Z",
        admin_override: true,
        subscription_source: "admin",
      },
      now
    );
    expect(copy.supporting).toContain("10 September 2026");
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.TRIALING);
    expect(copy.heading).toBe("You're on a free trial");
  });

  it("tightens copy with 2 days remaining", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-08-23T12:00:00.000Z",
      },
      now
    );
    expect(copy.heading).toBe("Your free trial ends soon");
    expect(copy.countdown).toBe("2 days remaining");
  });

  it("says tomorrow when 1 day remains", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-08-22T12:00:00.000Z",
      },
      now
    );
    expect(copy.heading).toBe("Your free trial ends tomorrow");
    expect(copy.countdown).toBe("1 day remaining");
    expect(copy.ctaLabel).toBe("Subscribe now");
  });

  it("shows hours when less than 24 hours remain", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-08-22T06:00:00.000Z",
      },
      now
    );
    expect(copy.heading).toBe("Your free trial ends soon");
    expect(copy.countdown).toBe("18 hours remaining");
    expect(copy.ctaLabel).toBe("Subscribe now");
  });

  it("does not show 0 days remaining after expiry", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "expired",
        trialEndAt: "2026-08-20T00:00:00.000Z",
      },
      now
    );
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.EXPIRED);
    expect(copy.heading).toBe("Your free trial has ended");
    expect(copy.countdown).toBeNull();
    expect(copy.ctaLabel).toBe("Choose a plan");
  });

  it("treats a still-trialing row past trial_ends_at as expired for display", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "trialing",
        trialEndAt: "2026-08-20T00:00:00.000Z",
      },
      now
    );
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.EXPIRED);
    expect(copy.heading).toBe("Your free trial has ended");
  });

  it("shows an active paid plan, not a subscribe CTA", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "active",
        plan: "business_monthly",
        planName: "Business",
        nextBillingDate: "2026-09-21T12:00:00.000Z",
        subscription_source: "payfast",
      },
      now
    );
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.ACTIVE);
    expect(copy.heading).toBe("Your Paidly subscription is active");
    expect(copy.supporting).toMatch(/Business/);
    expect(copy.ctaLabel).toBe("Manage subscription");
    expect(copy.ctaTo).toBe("billing");
  });

  it("shows administrator-managed access without trial expiry copy", () => {
    const copy = describeDashboardSubscriptionBanner(
      {
        status: "active",
        subscription_source: "admin",
        admin_override: true,
        trialEndAt: "2026-08-20T00:00:00.000Z",
      },
      now
    );
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.ADMIN_GRANTED);
    expect(copy.heading).toBe("Your Paidly access is active");
    expect(copy.supporting).toMatch(/administrator/);
    expect(copy.countdown).toBeNull();
  });

  it("shows cancelled copy", () => {
    const copy = describeDashboardSubscriptionBanner({ status: "cancelled" }, now);
    expect(copy.kind).toBe(DASHBOARD_BANNER_KIND.CANCELLED);
    expect(copy.heading).toMatch(/ended/);
    expect(copy.ctaLabel).toBe("Choose a plan");
  });

  it("never invents a trial end date from a missing timestamp", () => {
    const copy = describeDashboardSubscriptionBanner({ status: "trialing" }, now);
    expect(copy.heading).toBe("You're on a 7-day free trial");
    expect(copy.supporting).toBeNull();
  });
});
