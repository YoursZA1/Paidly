/**
 * App entry for subscription plans (re-exports repo-root shared/plans.js).
 * Use `@/lib/plans.js` in src/ — avoids @shared alias issues in some Vite/dev setups.
 */
export {
  base,
  PLANS,
  PLAN_SLUGS,
  normalizePlanSlug,
  getPlanBySlug,
  hasFeature,
  planIncludesFeature,
  priceForSlug,
} from "../../shared/plans.js";
