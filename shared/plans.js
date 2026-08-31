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

/** Self-serve PayFast checkout (no Enterprise / no annual cards in the upgrade grid). */
export const PUBLIC_SELF_SERVE_MONTHLY_SLUGS = /** @type {const} */ ([
  "starter_monthly",
  "business_monthly",
  "growth_monthly",
]);

/** Legacy catalog slugs — ITN / historical rows only. Never assignable for new admin writes or checkout. */
export const LEGACY_PLAN_SLUGS = /** @type {const} */ (["individual", "sme", "corporate"]);

/** Current catalog is the only selectable list. */
export const PLAN_SLUGS = PUBLIC_PLAN_SLUGS;

export function isLegacyPlanSlug(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  if (LEGACY_PLAN_SLUGS.includes(/** @type {any} */ (key))) return true;
  return key === "grandfathered" || key === "legacy_plan" || key === "old_plan";
}

/**
 * True when a slug/family may be assigned on create/update/checkout.
 * Legacy Individual / SME / Corporate are never assignable.
 */
export function isAssignableCurrentPlan(slug) {
  if (isLegacyPlanSlug(slug)) return false;
  const assignment = resolveCurrentCatalogAssignment({ plan: slug });
  return Boolean(assignment?.slug);
}

/** Profile `plan` / `subscription_plan` values that may be assigned by admin/signup. */
export const ASSIGNABLE_PROFILE_PLAN_SLUGS = Object.freeze([
  "starter",
  "business",
  "growth",
  "enterprise",
]);

/**
 * Coerce a profile plan write to the current catalog. Returns null when the value must be rejected.
 * `free` / `none` remain valid (no paid package). Legacy Individual/SME/Corporate are rejected.
 */
export function coerceAssignableProfilePlan(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!key || key === "none" || key === "free") return "free";
  if (isLegacyPlanSlug(key)) return null;
  const fam = familyForSlug(key);
  if (fam && ASSIGNABLE_PROFILE_PLAN_SLUGS.includes(fam)) return fam;
  if (ASSIGNABLE_PROFILE_PLAN_SLUGS.includes(/** @type {any} */ (key))) return key;
  return null;
}

/**
 * Map a stored slug to the current family for migration UI (does not assign).
 * @param {string} slug
 * @returns {import('./planFeatures.js').PlanFamily | null}
 */
export function mapLegacySlugToCurrentFamily(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  if (LEGACY_SLUG_ALIASES[key] && isLegacyPlanSlug(key)) return LEGACY_SLUG_ALIASES[key];
  return familyForSlug(key);
}

/**
 * Resolve family + billing cycle to a current catalog row. Never returns a legacy slug.
 * @param {{ plan?: string, billing_cycle?: string }} [input]
 */
export function resolveCurrentCatalogAssignment(input = {}) {
  const raw = String(input.plan || "")
    .trim()
    .toLowerCase();
  if (!raw || isLegacyPlanSlug(raw)) return null;

  const family = familyForSlug(raw);
  if (!family) return null;

  let cycle = String(input.billing_cycle || "")
    .trim()
    .toLowerCase();
  if (cycle === "yearly" || cycle === "annually") cycle = "annual";
  if (!cycle) {
    cycle = raw.endsWith("_annual") ? "annual" : "monthly";
  }

  if (family === "enterprise") {
    const p = PLANS.enterprise_custom;
    return {
      family: "enterprise",
      slug: "enterprise_custom",
      billing_cycle: "monthly",
      amount: 0,
      contact_sales: true,
      name: p.name,
    };
  }

  if (!["starter", "business", "growth"].includes(family)) return null;
  if (cycle !== "annual") cycle = "monthly";
  const slug = `${family}_${cycle}`;
  const p = PLANS[slug];
  if (!p) return null;
  return {
    family,
    slug,
    billing_cycle: cycle,
    amount: Number(p.price),
    contact_sales: false,
    name: p.name,
  };
}

/**
 * Group GET /api/subscriptions/plans rows (or shared fallback) by family for admin / pricing UIs.
 * @param {object[]} [planRows]
 */
export function buildPublicCatalogFamilies(planRows) {
  const rows =
    Array.isArray(planRows) && planRows.length
      ? planRows.filter((p) => p && !p.is_legacy)
      : PUBLIC_PLAN_SLUGS.map((slug) => {
          const p = getPlanBySlug(slug);
          if (!p) return null;
          return {
            slug,
            name: p.name,
            billing_cycle: p.billing_cycle || "monthly",
            amount: p.price,
            plan_family: p.family,
            contact_sales: Boolean(p.contact_sales),
          };
        }).filter(Boolean);

  const byFamily = new Map();
  for (const p of rows) {
    const fam = String(p.plan_family || familyForSlug(p.slug) || "").toLowerCase();
    if (!["starter", "business", "growth", "enterprise"].includes(fam)) continue;
    if (!byFamily.has(fam)) {
      byFamily.set(fam, {
        family: fam,
        name: p.name,
        contact_sales: Boolean(p.contact_sales),
        monthly: null,
        annual: null,
      });
    }
    const entry = byFamily.get(fam);
    const cyc = String(p.billing_cycle || "monthly").toLowerCase();
    if (cyc === "annual" || cyc === "yearly") entry.annual = p;
    else entry.monthly = p;
    entry.name = p.name || entry.name;
    entry.contact_sales = Boolean(entry.contact_sales || p.contact_sales);
  }

  return ["starter", "business", "growth", "enterprise"]
    .filter((f) => byFamily.has(f))
    .map((f) => byFamily.get(f));
}

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
