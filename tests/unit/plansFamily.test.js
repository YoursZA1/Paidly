import { describe, expect, it } from "vitest";
import {
  familyForSlug,
  hasFeature,
  normalizePlanSlug,
  priceForSlug,
  PLANS,
  isAssignableCurrentPlan,
  resolveCurrentCatalogAssignment,
  coerceAssignableProfilePlan,
  mapLegacySlugToCurrentFamily,
} from "../../shared/plans.js";
import { familyHasFeature, normalizePlanFamily } from "../../shared/planFeatures.js";

describe("plan slug / family aliases", () => {
  it("normalizes new and legacy slugs", () => {
    expect(normalizePlanSlug("starter_monthly")).toBe("starter_monthly");
    expect(normalizePlanSlug("Starter")).toBe("starter_monthly");
    expect(normalizePlanSlug("business")).toBe("business_monthly");
    expect(normalizePlanSlug("individual")).toBe("individual");
    expect(normalizePlanSlug("sme")).toBe("sme");
    expect(normalizePlanSlug("unknown-xyz")).toBeNull();
  });

  it("maps legacy slugs to families (goodwill upgrade)", () => {
    expect(familyForSlug("individual")).toBe("starter");
    expect(familyForSlug("sme")).toBe("business");
    expect(familyForSlug("corporate")).toBe("growth");
    expect(familyForSlug("business_annual")).toBe("business");
    expect(familyForSlug("growth_monthly")).toBe("growth");
  });

  it("prices match cutover catalog fallback", () => {
    expect(priceForSlug("starter_monthly")).toBe(50);
    expect(priceForSlug("starter_annual")).toBe(500);
    expect(priceForSlug("business_monthly")).toBe(150);
    expect(priceForSlug("business_annual")).toBe(1500);
    expect(priceForSlug("growth_monthly")).toBe(350);
    expect(priceForSlug("growth_annual")).toBe(3500);
    expect(priceForSlug("individual")).toBe(25);
  });

  it("feature gating is additive by family and default-denies unknown", () => {
    expect(hasFeature("starter_monthly", "invoices")).toBe(true);
    expect(hasFeature("starter_monthly", "inventory")).toBe(false);
    expect(hasFeature("starter_monthly", "pos")).toBe(false);
    expect(hasFeature("business_monthly", "inventory")).toBe(true);
    expect(hasFeature("business_monthly", "pos")).toBe(true);
    expect(hasFeature("growth_monthly", "multi_company")).toBe(true);
    expect(hasFeature("sme", "inventory")).toBe(true);
    expect(hasFeature("sme", "pos")).toBe(true);
    expect(familyHasFeature("starter", "not_a_real_feature")).toBe(false);
    expect(normalizePlanFamily("BUSINESS")).toBe("business");
  });

  it("enterprise is contact-sales in fallback", () => {
    expect(PLANS.enterprise_custom.contact_sales).toBe(true);
    expect(PLANS.enterprise_custom.price).toBe(0);
  });

  it("does not assign legacy slugs to the current catalog", () => {
    expect(isAssignableCurrentPlan("individual")).toBe(false);
    expect(isAssignableCurrentPlan("sme")).toBe(false);
    expect(isAssignableCurrentPlan("corporate")).toBe(false);
    expect(isAssignableCurrentPlan("starter")).toBe(true);
    expect(isAssignableCurrentPlan("growth_monthly")).toBe(true);
    expect(resolveCurrentCatalogAssignment({ plan: "individual" })).toBeNull();
    expect(resolveCurrentCatalogAssignment({ plan: "starter", billing_cycle: "monthly" })).toMatchObject({
      slug: "starter_monthly",
      amount: 50,
    });
    expect(resolveCurrentCatalogAssignment({ plan: "growth", billing_cycle: "monthly" })).toMatchObject({
      slug: "growth_monthly",
      amount: 350,
    });
    expect(resolveCurrentCatalogAssignment({ plan: "enterprise", billing_cycle: "annual" })).toMatchObject({
      slug: "enterprise_custom",
      amount: 0,
      billing_cycle: "monthly",
      contact_sales: true,
    });
    expect(coerceAssignableProfilePlan("sme")).toBeNull();
    expect(coerceAssignableProfilePlan("starter_monthly")).toBe("starter");
    expect(mapLegacySlugToCurrentFamily("corporate")).toBe("growth");
  });
});
