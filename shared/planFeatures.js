/**
 * Canonical SaaS feature keys + family → entitlement map.
 * Server and SPA must import from here (or plans.features jsonb) — never invent ad-hoc keys in UI only.
 */

/** @typedef {'starter'|'business'|'growth'|'enterprise'} PlanFamily */

export const PLAN_FAMILIES = /** @type {const} */ ([
  "starter",
  "business",
  "growth",
  "enterprise",
]);

export const FAMILY_TIER_RANK = Object.freeze({
  starter: 1,
  business: 2,
  growth: 3,
  enterprise: 4,
});

const STARTER_FEATURES = Object.freeze([
  "invoices",
  "quotes",
  "clients",
  "reports_basic",
  "basic_reports",
  "email_send",
  "email",
  "documents_pdf",
  "support_basic",
]);

/** Till / native POS — Business+; not a per-user or per-org allowlist. */
export const POS_PLAN_FEATURE = "pos";

const BUSINESS_FEATURES = Object.freeze([
  ...STARTER_FEATURES,
  "inventory",
  POS_PLAN_FEATURE,
  "expenses",
  "purchase_orders",
  "payslips",
  "vat_reports",
  "email_templates",
  "templates",
  "recurring_invoices",
  "support_priority",
]);

const GROWTH_FEATURES = Object.freeze([
  ...BUSINESS_FEATURES,
  "departments",
  "approval_workflows",
  "leave_management",
  "reports_advanced",
  "advanced_reports",
  "api_access",
  "integrations",
  "multi_company",
  "white_label",
]);

const ENTERPRISE_FEATURES = Object.freeze([
  ...GROWTH_FEATURES,
  "sso",
  "dedicated_support",
  "custom_contract",
]);

/** @type {Readonly<Record<PlanFamily, readonly string[]>>} */
export const FAMILY_FEATURES = Object.freeze({
  starter: STARTER_FEATURES,
  business: BUSINESS_FEATURES,
  growth: GROWTH_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
});

/** @type {Readonly<Record<PlanFamily, { seats: number | null, companies: number | null }>>} */
export const FAMILY_LIMITS = Object.freeze({
  starter: { seats: 1, companies: 1 },
  business: { seats: 5, companies: 1 },
  growth: { seats: null, companies: null },
  enterprise: { seats: null, companies: null },
});

/**
 * Minimum tier_rank required for a feature (additive by family).
 * Unknown feature → Infinity (default deny).
 * @param {string} featureKey
 */
export function requiredTierForFeature(featureKey) {
  const key = String(featureKey || "").trim();
  if (!key) return Number.POSITIVE_INFINITY;
  if (STARTER_FEATURES.includes(key)) return 1;
  if (BUSINESS_FEATURES.includes(key)) return 2;
  if (GROWTH_FEATURES.includes(key)) return 3;
  if (ENTERPRISE_FEATURES.includes(key)) return 4;
  return Number.POSITIVE_INFINITY;
}

/**
 * @param {string} family
 * @param {string} featureKey
 */
export function familyHasFeature(family, featureKey) {
  const fam = normalizePlanFamily(family);
  if (!fam) return false;
  const rank = FAMILY_TIER_RANK[fam];
  return rank >= requiredTierForFeature(featureKey);
}

/**
 * @param {string} raw
 * @returns {PlanFamily | null}
 */
export function normalizePlanFamily(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (PLAN_FAMILIES.includes(/** @type {PlanFamily} */ (s))) {
    return /** @type {PlanFamily} */ (s);
  }
  return null;
}
