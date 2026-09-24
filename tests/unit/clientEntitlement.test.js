import { describe, expect, it, beforeEach } from "vitest";
import {
  clientHasFeature,
  deriveEntitlementFromSubscriptionCurrent,
  getClientEntitlementSnapshot,
  publishClientEntitlement,
  resetClientEntitlementForTests,
} from "../../src/lib/clientEntitlement.js";

describe("clientEntitlement", () => {
  beforeEach(() => {
    resetClientEntitlementForTests();
  });

  it("denies paid features when accessGranted is false even if plan looks business", () => {
    const ent = deriveEntitlementFromSubscriptionCurrent({
      accessGranted: false,
      currentPlan: "business_monthly",
      planFamily: "business",
    });
    expect(ent.ready).toBe(true);
    expect(ent.accessGranted).toBe(false);
    publishClientEntitlement(ent);
    expect(clientHasFeature("payslips")).toBe(false);
    expect(clientHasFeature("invoices")).toBe(false);
  });

  it("allows business features when accessGranted and plan is business", () => {
    const ent = deriveEntitlementFromSubscriptionCurrent({
      accessGranted: true,
      currentPlan: "business_monthly",
      planFamily: "business",
    });
    publishClientEntitlement(ent);
    expect(clientHasFeature("payslips")).toBe(true);
    expect(clientHasFeature("leave_management")).toBe(true); // Leave is Business+
    expect(clientHasFeature("api_access")).toBe(false);
  });

  it("never falls back to profiles.plan before the subscription loads", () => {
    const ent = deriveEntitlementFromSubscriptionCurrent(null, { profileSlug: "business_monthly" });
    expect(ent.ready).toBe(false);
    expect(ent.planSlug).toBeNull();
    publishClientEntitlement(ent);
    expect(getClientEntitlementSnapshot().source).toBe("loading");
  });

  it("prefers the server entitlement block", () => {
    const ent = deriveEntitlementFromSubscriptionCurrent({
      accessGranted: true,
      currentPlan: "starter_monthly",
      entitlement: { plan: "growth", accessGranted: true, status: "active" },
    });
    expect(ent.planSlug).toBe("growth");
  });
});
