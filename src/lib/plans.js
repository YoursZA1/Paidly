/**
 * App entry for subscription plans (re-exports repo-root shared/plans.js).
 */
export {
  base,
  PLANS,
  PLAN_SLUGS,
  PUBLIC_PLAN_SLUGS,
  LEGACY_PLAN_SLUGS,
  LEGACY_SLUG_ALIASES,
  PLAN_FAMILIES,
  FAMILY_FEATURES,
  FAMILY_LIMITS,
  FAMILY_TIER_RANK,
  familyForSlug,
  familyHasFeature,
  normalizePlanSlug,
  getPlanBySlug,
  hasFeature,
  planIncludesFeature,
  priceForSlug,
  POS_PLAN_FEATURE,
} from "../../shared/plans.js";
