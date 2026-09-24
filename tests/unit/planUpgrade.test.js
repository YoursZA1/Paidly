import { describe, expect, it } from "vitest";
import {
  UPGRADE_ACTION,
  familiesAbove,
  nextPlanFor,
  offerablePlans,
  resolveUpgradeTarget,
} from "../../shared/planUpgrade.js";
import { describeDashboardSubscriptionBanner } from "../../shared/subscriptionDashboardCopy.js";

const SELF_SERVE = ["starter", "business", "growth"];

describe("resolveUpgradeTarget — package decides, trial only sets duration", () => {
  // Trial → X and admin-activated → X both arrive here as { currentPlan: X, accessGranted: true }.
  it.each([
    ["starter", "reports_basic"],
    ["business", "reports_basic"],
    ["business", "inventory"],
    ["growth", "reports_basic"],
    ["growth", "inventory"],
    ["growth", "leave_management"],
  ])("%s with access to %s needs nothing", (plan, feature) => {
    expect(resolveUpgradeTarget({ currentPlan: plan, accessGranted: true, featureKey: feature }).action).toBe(
      UPGRADE_ACTION.NONE
    );
  });

  it("Starter needing a Business feature → Upgrade to Business", () => {
    const t = resolveUpgradeTarget({ currentPlan: "starter", accessGranted: true, featureKey: "inventory" });
    expect(t).toMatchObject({ action: "upgrade", plan: "business", label: "Upgrade to Business" });
  });

  it("Starter needing a Growth feature → Upgrade to Growth (skips Business)", () => {
    const t = resolveUpgradeTarget({ currentPlan: "starter", accessGranted: true, featureKey: "api_access" });
    expect(t).toMatchObject({ action: "upgrade", plan: "growth" });
  });

  it("Business needing a Growth feature → Upgrade to Growth", () => {
    const t = resolveUpgradeTarget({ currentPlan: "business", accessGranted: true, featureKey: "multi_company" });
    expect(t).toMatchObject({ action: "upgrade", plan: "growth", label: "Upgrade to Growth" });
  });

  it("Growth is the top of the path: no upgrade CTA even for an Enterprise-only feature", () => {
    for (const featureKey of [null, "sso", "white_label"]) {
      const t = resolveUpgradeTarget({ currentPlan: "growth", accessGranted: true, featureKey });
      expect(t).toMatchObject({ action: "none", label: "" });
    }
  });

  it("expired Business trial on a Starter-level feature → Renew Business, never Starter", () => {
    const t = resolveUpgradeTarget({ currentPlan: "business", accessGranted: false, featureKey: "reports_basic" });
    expect(t).toMatchObject({ action: "renew", plan: "business", label: "Renew Business" });
  });

  it("expired Growth trial → Renew Growth", () => {
    const t = resolveUpgradeTarget({ currentPlan: "growth", accessGranted: false, featureKey: "invoices" });
    expect(t.label).toBe("Renew Growth");
  });

  it("no package at all → subscribe to the lowest package with the feature", () => {
    expect(resolveUpgradeTarget({ featureKey: "reports_basic" }).label).toBe("Subscribe to Starter");
    expect(resolveUpgradeTarget({ featureKey: "inventory" }).label).toBe("Subscribe to Business");
  });

  it("never says 'Upgrade to Starter' for Business or Growth, with or without access", () => {
    const features = ["invoices", "reports_basic", "inventory", "leave_management", "sso"];
    for (const plan of ["business", "growth"]) {
      for (const accessGranted of [true, false]) {
        for (const featureKey of features) {
          const t = resolveUpgradeTarget({ currentPlan: plan, accessGranted, featureKey });
          expect(t.plan).not.toBe("starter");
          expect(t.label).not.toMatch(/Starter/);
        }
      }
    }
  });
});

describe("offerablePlans", () => {
  it("with access, only packages above the current one", () => {
    expect(offerablePlans({ currentPlan: "starter", accessGranted: true }, SELF_SERVE)).toEqual(["business", "growth"]);
    expect(offerablePlans({ currentPlan: "business", accessGranted: true }, SELF_SERVE)).toEqual(["growth"]);
    expect(offerablePlans({ currentPlan: "growth", accessGranted: true }, SELF_SERVE)).toEqual([]);
  });

  it("lapsed: the current package (renew) and above, never below", () => {
    expect(offerablePlans({ currentPlan: "business", accessGranted: false }, SELF_SERVE)).toEqual(["business", "growth"]);
  });

  it("no package: everything", () => {
    expect(offerablePlans({}, SELF_SERVE)).toEqual(SELF_SERVE);
  });

  it("feature filter keeps only packages that include it", () => {
    expect(offerablePlans({ currentPlan: "starter", accessGranted: true, featureKey: "api_access" }, SELF_SERVE)).toEqual([
      "growth",
    ]);
  });
});

describe("next package helpers", () => {
  it("familiesAbove / nextPlanFor", () => {
    expect(familiesAbove("business")).toEqual(["growth"]);
    expect(familiesAbove("growth")).toEqual([]);
    expect(nextPlanFor("starter")).toBe("business");
    expect(nextPlanFor("business", "api_access")).toBe("growth");
    expect(nextPlanFor("enterprise")).toBeNull();
  });
});

describe("dashboard banner names the package through the trial", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("Business trial says Business", () => {
    const copy = describeDashboardSubscriptionBanner(
      { status: "trialing", planName: "Business", trialEndsAt: "2026-09-06T00:00:00Z" },
      now
    );
    expect(copy.supporting).toMatch(/full Business access/);
    expect(copy.ctaLabel).toBe("Keep Business");
  });

  it("expired Growth trial points back to Growth", () => {
    const copy = describeDashboardSubscriptionBanner({ status: "expired", planName: "Growth" }, now);
    expect(copy.heading).toBe("Your Growth free trial has ended");
    expect(copy.ctaLabel).toBe("Subscribe to Growth");
  });
});
