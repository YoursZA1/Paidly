/**
 * Plan slug / family aliases for Paidly billing.
 * Catalog amounts live in `public.plans` (SoR). This module is fallback + entitlement helper.
 *
 * New catalog: starter_* | business_* | growth_* | enterprise_custom
 * Legacy (grandfathered): individual | sme | corporate
 */

import {
  FAMILY_FEATURES,
  FAMILY_LIMITS,
  FAMILY_TIER_RANK,
  familyHasFeature,
  normalizePlanFamily,
  PLAN_FAMILIES,
  POS_PLAN_FEATURE,
} from "./planFeatures.js";

export { FAMILY_FEATURES, FAMILY_LIMITS, FAMILY_TIER_RANK, familyHasFeature, PLAN_FAMILIES, POS_PLAN_FEATURE };

/** @deprecated Prefer plans.features — kept for EntityManager / older callers */
export const base = ["invoices", "clients", "email"];

/**
 * Legacy slug → family (goodwill: sme→business, corporate→growth).
 * @type {Readonly<Record<string, import('./planFeatures.js').PlanFamily>>}
 */
export const LEGACY_SLUG_ALIASES = Object.freeze({
  individual: "starter",
  free: "starter",
  basic: "starter",
  trial: "starter",
  none: "starter",
  starter: "starter",
  sme: "business",
  professional: "business",
  pro: "business",
  business: "business",
  corporate: "growth",
  growth: "growth",
  enterprise: "enterprise",
});

/** Cycle-qualified public slugs. */
export const PUBLIC_PLAN_SLUGS = /** @type {const} */ ([
  "starter_monthly",
  "starter_annual",
  "business_monthly",
  "business_annual",
  "growth_monthly",
  "growth_annual",
  "enterprise_custom",
]);

/** Legacy catalog slugs (kept for ITN / grandfathered rows). */
export const LEGACY_PLAN_SLUGS = /** @type {const} */ (["individual", "sme", "corporate"]);

/** @deprecated Use PUBLIC_PLAN_SLUGS + LEGACY_PLAN_SLUGS — still exported for old imports */
export const PLAN_SLUGS = LEGACY_PLAN_SLUGS;

/** Fallback display/price when DB unavailable (dev only). */
export const PLANS = {
  individual: {
    name: "Individual",
    price: 25,
    family: "starter",
    features: [...FAMILY_FEATURES.starter],
  },
  sme: {
    name: "SME",
    price: 50,
    family: "business",
    features: [...FAMILY_FEATURES.business],
  },
  corporate: {
    name: "Corporate",
    price: 110,
    family: "growth",
    features: [...FAMILY_FEATURES.growth],
  },
  starter_monthly: {
    name: "Starter",
    price: 50,
    family: "starter",
    billing_cycle: "monthly",
    features: [...FAMILY_FEATURES.starter],
  },
  starter_annual: {
    name: "Starter",
    price: 500,
    family: "starter",
    billing_cycle: "annual",
    features: [...FAMILY_FEATURES.starter],
  },
  business_monthly: {
    name: "Business",
    price: 150,
    family: "business",
    billing_cycle: "monthly",
    features: [...FAMILY_FEATURES.business],
  },
  business_annual: {
    name: "Business",
    price: 1500,
    family: "business",
    billing_cycle: "annual",
    features: [...FAMILY_FEATURES.business],
  },
  growth_monthly: {
    name: "Growth",
    price: 350,
    family: "growth",
    billing_cycle: "monthly",
    features: [...FAMILY_FEATURES.growth],
  },
  growth_annual: {
    name: "Growth",
    price: 3500,
    family: "growth",
    billing_cycle: "annual",
    features: [...FAMILY_FEATURES.growth],
  },
  enterprise_custom: {
    name: "Enterprise",
    price: 0,
    family: "enterprise",
    billing_cycle: "monthly",
    contact_sales: true,
    features: [...FAMILY_FEATURES.enterprise],
  },
};

/**
 * @param {string} slug
 * @returns {import('./planFeatures.js').PlanFamily | null}
 */
export function familyForSlug(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const direct = normalizePlanFamily(key);
  if (direct) return direct;
  if (key in LEGACY_SLUG_ALIASES) return LEGACY_SLUG_ALIASES[key];
  if (key.endsWith("_monthly") || key.endsWith("_annual")) {
    const fam = key.replace(/_monthly$|_annual$/, "");
    return normalizePlanFamily(fam);
  }
  if (key in PLANS && PLANS[key].family) {
    return normalizePlanFamily(PLANS[key].family);
  }
  return null;
}

/**
 * Normalize to a known plan slug (checkout or legacy). Bare family → *_monthly for display only.
 * @param {string} slug
 * @returns {string | null}
 */
export function normalizePlanSlug(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (key in PLANS) return key;
  if (PUBLIC_PLAN_SLUGS.includes(/** @type {any} */ (key))) return key;
  if (LEGACY_PLAN_SLUGS.includes(/** @type {any} */ (key))) return key;
  // Bare family → default monthly (checkout should send explicit cycle slug)
  if (key === "starter") return "starter_monthly";
  if (key === "business") return "business_monthly";
  if (key === "growth") return "growth_monthly";
  if (key === "enterprise") return "enterprise_custom";
  return null;
}

/**
 * @param {string} slug
 */
export function getPlanBySlug(slug) {
  const key = normalizePlanSlug(slug);
  return key && PLANS[key] ? { ...PLANS[key], slug: key } : null;
}

/**
 * Feature gating by plan slug or family string.
 * @param {string} plan
 * @param {string} feature
 */
export const hasFeature = (plan, feature) => {
  const fam = familyForSlug(plan) || normalizePlanFamily(plan);
  if (!fam) return false;
  return familyHasFeature(fam, feature);
};

/**
 * @param {string} planSlug
 * @param {string} featureKey
 */
export function planIncludesFeature(planSlug, featureKey) {
  return hasFeature(planSlug, featureKey);
}

/**
 * @param {string} slug
 * @returns {number | null}
 */
export function priceForSlug(slug) {
  const plan = getPlanBySlug(slug);
  return plan ? plan.price : null;
}
