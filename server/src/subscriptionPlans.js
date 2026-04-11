/** Re-export shared tier config so server code uses one import path (`./subscriptionPlans.js`). */
export {
  PLANS,
  PLAN_SLUGS,
  base,
  getPlanBySlug,
  hasFeature,
  normalizePlanSlug,
  planIncludesFeature,
  priceForSlug,
} from "../../shared/plans.js";
