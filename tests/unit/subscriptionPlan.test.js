import { describe, it, expect } from "vitest";
import {
  normalizePaidPackageKey,
  pickPreferredSubscriptionRow,
  describeSubscriptionState,
  slugFromProfile,
  isSubscriptionExpired,
  shouldShowExpiredSubscriptionLock,
} from "@/lib/subscriptionPlan";

describe("normalizePaidPackageKey", () => {
  it("maps product and legacy slugs to starter | business | growth | enterprise", () => {
    expect(normalizePaidPackageKey("individual")).toBe("starter");
    expect(normalizePaidPackageKey("free")).toBe("starter");
    expect(normalizePaidPackageKey("trial")).toBe("starter");
    expect(normalizePaidPackageKey("sme")).toBe("business");
    expect(normalizePaidPackageKey("professional")).toBe("business");
    expect(normalizePaidPackageKey("corporate")).toBe("growth");
    expect(normalizePaidPackageKey("enterprise")).toBe("enterprise");
  });

  it("reads slug from profile-shaped objects", () => {
    expect(normalizePaidPackageKey({ subscription_plan: "sme" })).toBe("business");
    expect(normalizePaidPackageKey({ plan: "corporate" })).toBe("growth");
  });
});

describe("pickPreferredSubscriptionRow", () => {
  it("prefers active over inactive then newer created_at", () => {
    const older = {
      id: "1",
      user_id: "u",
      status: "inactive",
      plan: "individual",
      created_at: "2020-01-01T00:00:00Z",
    };
    const active = {
      id: "2",
      user_id: "u",
      status: "active",
      plan: "sme",
      created_at: "2020-06-01T00:00:00Z",
    };
    expect(pickPreferredSubscriptionRow([older, active])).toMatchObject({ id: "2", status: "active" });
    expect(pickPreferredSubscriptionRow([active, older])).toMatchObject({ id: "2", status: "active" });
  });

  it("returns null for empty input", () => {
    expect(pickPreferredSubscriptionRow([])).toBeNull();
    expect(pickPreferredSubscriptionRow(null)).toBeNull();
  });
});

describe("describeSubscriptionState", () => {
  it("labels free + inactive as Free / No active subscription", () => {
    const d = describeSubscriptionState({
      plan: "free",
      subscription_plan: "free",
      subscription_status: "inactive",
    });
    expect(d.packageLabel).toBe("Free");
    expect(d.statusLabel).toBe("No active subscription");
  });

  it("labels active SME as Paid · Active", () => {
    const d = describeSubscriptionState({
      plan: "sme",
      subscription_plan: "sme",
      subscription_status: "active",
    });
    expect(d.packageLabel).toBe("Business");
    expect(d.statusLabel).toBe("Paid · Active");
  });

  it("labels trial with future trial_ends_at", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const d = describeSubscriptionState({
      plan: "individual",
      subscription_status: "trial",
      trial_ends_at: future,
    });
    expect(d.statusLabel).toMatch(/Free Trial/);
  });
});

describe("slugFromProfile", () => {
  it("prefers subscription_plan then plan (billing source of truth)", () => {
    expect(slugFromProfile({ plan: "sme", subscription_plan: "individual" })).toBe("individual");
    expect(slugFromProfile({ plan: "individual", subscription_plan: "sme" })).toBe("sme");
    expect(slugFromProfile({ subscription_plan: "corporate" })).toBe("corporate");
  });
});

describe("shouldShowExpiredSubscriptionLock", () => {
  it("locks back office when the subscription is expired", () => {
    expect(isSubscriptionExpired({ subscription_status: "expired" })).toBe(true);
    expect(shouldShowExpiredSubscriptionLock({ expired: true })).toBe(true);
  });

  it("keeps the POS till open so cashiers can sell during a billing lock", () => {
    expect(
      shouldShowExpiredSubscriptionLock({
        expired: true,
        isPosTerminal: true,
      })
    ).toBe(false);
  });

  it("still allows Settings, Billing, admin, and staff bypass", () => {
    expect(shouldShowExpiredSubscriptionLock({ expired: true, onSettingsRoute: true })).toBe(false);
    expect(shouldShowExpiredSubscriptionLock({ expired: true, onBillingRoute: true })).toBe(false);
    expect(shouldShowExpiredSubscriptionLock({ expired: true, isAdminRoute: true })).toBe(false);
    expect(shouldShowExpiredSubscriptionLock({ expired: true, billingBypassRole: true })).toBe(false);
  });
});
