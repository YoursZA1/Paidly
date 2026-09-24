/**
 * THE Paidly plan entitlement definition (see docs/PLAN_ENTITLEMENTS.md).
 *
 * Plan → features + limits. Nothing else decides feature access: trial / paid / admin activation /
 * expiry only decide WHETHER the company currently has its plan (shared/subscriptionAccess.js).
 * Server gates, the SPA and the database guard (paidly_feature_min_tier, verified against this file
 * by tests/unit/planEntitlementMatrix.test.js) all read this catalog.
 *
 * Adding a feature: add its key to the lowest package that includes it (tiers are additive, Growth
 * inherits everything), gate the page with <FeatureGate feature="key"> and the API/table with
 * requireFeature / assertUserHasFeature (or the DB guard for browser-written tables).
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
  // Issuing payslips (standalone Payslips page). How many employees: FAMILY_LIMITS.payslipEmployees.
  "payslips",
]);

/** Till / native POS — Business+; not a per-user or per-org allowlist. */
export const POS_PLAN_FEATURE = "pos";

const BUSINESS_FEATURES = Object.freeze([
  ...STARTER_FEATURES,
  "inventory",
  POS_PLAN_FEATURE,
  "expenses",
  "purchase_orders",
  "vat_reports",
  "email_templates",
  "templates",
  "recurring_invoices",
  // Payroll engine: pay runs, PAYE/UIF calculation, payroll reports. Same employee limit as payslips.
  "payroll",
  "leave_management",
  "support_priority",
]);

const GROWTH_FEATURES = Object.freeze([
  ...BUSINESS_FEATURES,
  "departments",
  "approval_workflows",
  "reports_advanced",
  "advanced_reports",
  "api_access",
  "integrations",
  "multi_company",
]);

const ENTERPRISE_FEATURES = Object.freeze([
  ...GROWTH_FEATURES,
  "sso",
  "dedicated_support",
  "custom_contract",
  "white_label",
]);

/** @type {Readonly<Record<PlanFamily, readonly string[]>>} */
export const FAMILY_FEATURES = Object.freeze({
  starter: STARTER_FEATURES,
  business: BUSINESS_FEATURES,
  growth: GROWTH_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
});

/**
 * Package limits. null = unlimited.
 * seats            — members with a login (team invites)
 * companies        — companies per account
 * payslipEmployees — distinct employees who can be issued payslips (standalone payslips and pay runs)
 * @type {Readonly<Record<PlanFamily, { seats: number | null, companies: number | null, payslipEmployees: number | null }>>}
 */
export const FAMILY_LIMITS = Object.freeze({
  starter: { seats: 1, companies: 1, payslipEmployees: 1 },
  business: { seats: 5, companies: 1, payslipEmployees: 4 },
  growth: { seats: null, companies: null, payslipEmployees: null },
  enterprise: { seats: null, companies: null, payslipEmployees: null },
});

/**
 * Lowest package whose `limitKey` allows `needed` (null limit = unlimited), at or above `family`.
 * Used to phrase "Upgrade to …" for a limit, from the current package.
 * @param {string | null | undefined} family
 * @param {"seats" | "companies" | "payslipEmployees"} limitKey
 * @param {number} needed
 * @returns {PlanFamily | null}
 */
export function lowestFamilyAllowing(family, limitKey, needed) {
  const fam = normalizePlanFamily(family);
  const floor = fam ? FAMILY_TIER_RANK[fam] : 0;
  return (
    ["starter", "business", "growth"].find((f) => {
      if (FAMILY_TIER_RANK[f] < floor) return false;
      const cap = FAMILY_LIMITS[f][limitKey];
      return cap == null || needed <= cap;
    }) || null
  );
}

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

/**
 * Every feature key a plan includes. Unknown/no plan → none.
 * @param {string | null | undefined} family
 * @returns {readonly string[]}
 */
export function getPlanEntitlements(family) {
  const fam = normalizePlanFamily(family);
  return fam ? FAMILY_FEATURES[fam] : [];
}

/**
 * Numeric limit for a plan (null = unlimited). Unknown/no plan → 0.
 * @param {string | null | undefined} family
 * @param {"seats" | "companies" | "payslipEmployees"} limitKey
 * @returns {number | null}
 */
export function getFeatureLimit(family, limitKey) {
  const fam = normalizePlanFamily(family);
  if (!fam) return 0;
  const value = FAMILY_LIMITS[fam][limitKey];
  return value === undefined ? 0 : value;
}

/**
 * Identity a payslip counts against FAMILY_LIMITS.payslipEmployees: the linked employee
 * (membership), else the printed employee number, else the employee name. Mirrored by the DB guard
 * (paidly_enforce_plan_feature) so the UI never shows a different count than the server enforces.
 * @param {{ membership_id?: string | null, employee_id?: string | null, employee_name?: string | null }} row
 * @returns {string | null}
 */
export function payslipEmployeeKey(row) {
  const clean = (v) => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };
  const membership = clean(row?.membership_id);
  if (membership) return membership;
  const number = clean(row?.employee_id);
  if (number) return number.toLowerCase();
  const name = clean(row?.employee_name);
  return name ? name.toLowerCase() : null;
}

/**
 * The payslip employee limit, one rule everywhere (pay runs, standalone payslips, DB guard):
 * employees who already have payslips keep being paid (grandfathered, even above the limit after a
 * downgrade); a NEW employee may be added only while the distinct total stays within the limit.
 * @param {{ limit: number | null, issuedKeys: Iterable<string | null>, requestedKeys: Iterable<string | null> }} input
 * @returns {{ ok: boolean, used: number, newKeys: string[], limit: number | null }}
 */
export function checkPayslipCapacity({ limit, issuedKeys, requestedKeys }) {
  const issued = new Set([...issuedKeys].filter(Boolean));
  const newKeys = [...new Set([...requestedKeys].filter(Boolean))].filter((k) => !issued.has(k));
  const ok = limit == null || newKeys.length === 0 || issued.size + newKeys.length <= limit;
  return { ok, used: issued.size, newKeys, limit: limit ?? null };
}

/**
 * Catalog rows (public.services) serve two plans: services / labour / materials / expenses are the
 * invoicing catalog (every plan, feature "invoices"); stock-tracked products are Inventory
 * (Business+). Mirrored by the DB guard on services.
 * @param {string | null | undefined} itemType
 * @returns {"inventory" | "invoices"}
 */
export function catalogItemFeature(itemType) {
  return String(itemType || "service").trim().toLowerCase() === "product" ? "inventory" : "invoices";
}
