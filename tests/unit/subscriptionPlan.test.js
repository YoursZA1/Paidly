import { describe, it, expect } from "vitest";
import {
  normalizePaidPackageKey,
  pickPreferredSubscriptionRow,
  describeSubscriptionState,
  slugFromProfile,
} from "@/lib/subscriptionPlan";

describe("normalizePaidPackageKey", () => {
  it("maps product and legacy slugs to individual | sme | corporate", () => {
    expect(normalizePaidPackageKey("individual")).toBe("individual");
    expect(normalizePaidPackageKey("free")).toBe("individual");
    expect(normalizePaidPackageKey("trial")).toBe("individual");
    expect(normalizePaidPackageKey("sme")).toBe("sme");
    expect(normalizePaidPackageKey("professional")).toBe("sme");
    expect(normalizePaidPackageKey("corporate")).toBe("corporate");
    expect(normalizePaidPackageKey("enterprise")).toBe("corporate");
  });

  it("reads slug from profile-shaped objects", () => {
    expect(normalizePaidPackageKey({ subscription_plan: "sme" })).toBe("sme");
    expect(normalizePaidPackageKey({ plan: "corporate" })).toBe("corporate");
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
    expect(d.packageLabel).toBe("SME");
    expect(d.statusLabel).toBe("Paid · Active");
  });

  it("labels trial with future trial_ends_at", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const d = describeSubscriptionState({
      plan: "individual",
      subscription_status: "trial",
      trial_ends_at: future,
    });
    expect(d.statusLabel).toBe("Trial");
  });
});

describe("slugFromProfile", () => {
  it("prefers plan then subscription_plan", () => {
    expect(slugFromProfile({ plan: "sme", subscription_plan: "individual" })).toBe("sme");
    expect(slugFromProfile({ subscription_plan: "corporate" })).toBe("corporate");
  });
});
