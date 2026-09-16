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
    expect(clientHasFeature("leave_management")).toBe(false);
  });

  it("profile provisional still used before ready", () => {
    const ent = deriveEntitlementFromSubscriptionCurrent(null, {
      profileSlug: "business_monthly",
    });
    expect(ent.ready).toBe(false);
    publishClientEntitlement(ent);
    expect(getClientEntitlementSnapshot().source).toBe("profile_provisional");
    expect(clientHasFeature("payslips")).toBe(true);
  });
});
