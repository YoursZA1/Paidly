/**
 * Paidly subscription tiers — single source of truth for backend, Vercel API routes, and Vite app.
 * Slugs align with `profiles.subscription_plan` / PayFast ITN normalization (individual | sme | corporate).
 *
 * Feature lists: build from a shared base, then each tier extends the previous (no duplicated keys).
 */

/** Core capabilities every paid tier includes; higher tiers spread from this + parent tier. */
export const base = ["invoices", "clients", "email"];

const individualFeatures = [...base, "basic_reports"];
const smeFeatures = [...individualFeatures, "quotes", "templates"];
const corporateFeatures = [...smeFeatures, "advanced_reports"];

export const PLANS = {
  individual: {
    name: "Individual",
    price: 25,
    features: individualFeatures,
  },
  sme: {
    name: "SME",
    price: 50,
    features: smeFeatures,
  },
  corporate: {
    name: "Corporate",
    price: 110,
    features: corporateFeatures,
  },
};

/** Canonical tier slugs (order: entry → growth → top). */
export const PLAN_SLUGS = /** @type {const} */ (["individual", "sme", "corporate"]);

/**
 * @param {string} slug
 * @returns {keyof typeof PLANS | null}
 */
export function normalizePlanSlug(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  return key in PLANS ? /** @type {keyof typeof PLANS} */ (key) : null;
}

/**
 * @param {string} slug
 */
export function getPlanBySlug(slug) {
  const key = normalizePlanSlug(slug);
  return key ? PLANS[key] : null;
}

/**
 * Feature gating: `plan` is `profiles.plan` / billing slug (individual | sme | corporate).
 * Unknown slugs (e.g. free, expired, starter) → false.
 *
 * @param {string} plan
 * @param {string} feature
 */
export const hasFeature = (plan, feature) => {
  const key = normalizePlanSlug(plan);
  if (!key) return false;
  const list = PLANS[key]?.features;
  return Array.isArray(list) && list.includes(feature);
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
