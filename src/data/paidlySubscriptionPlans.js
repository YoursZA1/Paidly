import {
  PLANS,
  PLAN_SLUGS,
  PUBLIC_PLAN_SLUGS,
  base,
  getPlanBySlug,
  hasFeature,
  normalizePlanSlug,
  planIncludesFeature,
  priceForSlug,
} from "@/lib/plans.js";

/**
 * Display-only amounts — checkout must use GET /api/subscriptions/plans + POST /api/subscriptions/create.
 */
export const plans = Object.fromEntries(
  [...PLAN_SLUGS, ...PUBLIC_PLAN_SLUGS]
    .filter((slug, i, arr) => arr.indexOf(slug) === i)
    .map((slug) => {
      const p = PLANS[slug];
      return p ? [p.name, p.price] : null;
    })
    .filter(Boolean)
);

/** Admin + DB slug → ZAR (fallback only). New catalog monthly list prices; legacy slugs stay grandfathered. */
export const PLAN_DEFAULT_AMOUNT = {
  starter: PLANS.starter_monthly.price,
  business: PLANS.business_monthly.price,
  growth: PLANS.growth_monthly.price,
  enterprise: 0,
  starter_monthly: PLANS.starter_monthly.price,
  starter_annual: PLANS.starter_annual.price,
  business_monthly: PLANS.business_monthly.price,
  business_annual: PLANS.business_annual.price,
  growth_monthly: PLANS.growth_monthly.price,
  growth_annual: PLANS.growth_annual.price,
  enterprise_custom: 0,
  individual: PLANS.individual.price,
  sme: PLANS.sme.price,
  corporate: PLANS.corporate.price,
};

export {
  PLANS,
  PLAN_SLUGS,
  PUBLIC_PLAN_SLUGS,
  base,
  getPlanBySlug,
  hasFeature,
  normalizePlanSlug,
  planIncludesFeature,
  priceForSlug,
};

/** PayFast `amount` field: two decimal string. */
export function payfastAmountZar(displayPlanName) {
  const v = plans[displayPlanName];
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

/** UI label e.g. `R 50` */
export function priceLabelZar(displayPlanName) {
  const v = plans[displayPlanName];
  return typeof v === "number" && Number.isFinite(v) ? `R ${v}` : "";
}
