import {
  PLANS,
  PLAN_SLUGS,
  base,
  getPlanBySlug,
  hasFeature,
  normalizePlanSlug,
  planIncludesFeature,
  priceForSlug,
} from "@shared/plans.js";

/**
 * PayFast `item_name` / display keys → monthly ZAR (from `PLANS`).
 * Keys match `item_name` / `custom_str2` sent at checkout.
 */
export const plans = Object.fromEntries(
  PLAN_SLUGS.map((slug) => [PLANS[slug].name, PLANS[slug].price])
);

/** Admin + DB slug → monthly ZAR (single source: `shared/plans.js`). */
export const PLAN_DEFAULT_AMOUNT = {
  individual: PLANS.individual.price,
  sme: PLANS.sme.price,
  corporate: PLANS.corporate.price,
};

export {
  PLANS,
  PLAN_SLUGS,
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

/** UI label e.g. `R 25` */
export function priceLabelZar(displayPlanName) {
  const v = plans[displayPlanName];
  return typeof v === "number" && Number.isFinite(v) ? `R ${v}` : "";
}
