/**
 * Public pricing copy for the homepage, JSON-LD, signup, and in-app upgrade UI.
 * Amounts must match `PLANS` in `shared/plans.js` (fallback) / `public.plans` (SoR).
 * Legacy Individual / SME / Corporate are not listed here — they are not sellable.
 */

export const MARKETING_TRIAL_FOOTER =
  "All self-serve plans include a free trial. No credit card required to start.";

export const MARKETING_PLAN_ORDER = /** @type {const} */ ([
  "starter",
  "business",
  "growth",
  "enterprise",
]);

/** @typedef {'starter'|'business'|'growth'|'enterprise'} MarketingFamily */

/**
 * @typedef {object} MarketingPlan
 * @property {MarketingFamily} family
 * @property {string} name
 * @property {number} monthlyPriceZar
 * @property {number} annualPriceZar
 * @property {string} description
 * @property {readonly string[]} features
 * @property {boolean} highlighted
 * @property {string | null} badge
 * @property {boolean} contactSales
 * @property {string} ctaSignup
 */

/** @type {Readonly<Record<MarketingFamily, MarketingPlan>>} */
export const MARKETING_PLANS = Object.freeze({
  starter: Object.freeze({
    family: "starter",
    name: "Starter",
    monthlyPriceZar: 50,
    annualPriceZar: 500,
    description: "Freelancers & individuals (annual — 2 months free)",
    features: Object.freeze([
      "Unlimited quotes & invoices",
      "Client management",
      "Basic reporting",
      "Email invoices",
      "1 user",
      "Basic support",
    ]),
    highlighted: false,
    badge: null,
    contactSales: false,
    ctaSignup: "Get started free",
  }),
  business: Object.freeze({
    family: "business",
    name: "Business",
    monthlyPriceZar: 150,
    annualPriceZar: 1500,
    description: "SMEs (annual — 2 months free)",
    features: Object.freeze([
      "Everything in Starter +",
      "Up to 5 users",
      "Inventory/expenses & purchase orders",
      "Payslips & VAT reports",
      "Recurring invoices",
      "Priority support",
    ]),
    highlighted: true,
    badge: "Most popular",
    contactSales: false,
    ctaSignup: "Get started free",
  }),
  growth: Object.freeze({
    family: "growth",
    name: "Growth",
    monthlyPriceZar: 350,
    annualPriceZar: 3500,
    description: "Growing businesses (annual — 2 months free)",
    features: Object.freeze([
      "Everything in Business +",
      "Unlimited team members",
      "Departments & approvals",
      "Advanced reports & API",
      "Integrations & multi-company",
    ]),
    highlighted: false,
    badge: null,
    contactSales: false,
    ctaSignup: "Get started free",
  }),
  enterprise: Object.freeze({
    family: "enterprise",
    name: "Enterprise",
    monthlyPriceZar: 0,
    annualPriceZar: 0,
    description: "Large organisations — custom pricing",
    features: Object.freeze([
      "Everything in Growth +",
      "Custom contract & SSO",
      "Dedicated support",
      "White label (optional)",
    ]),
    highlighted: false,
    badge: null,
    contactSales: true,
    ctaSignup: "Contact sales",
  }),
});

/**
 * @param {number} amount
 * @param {{ grouped?: boolean }} [opts]
 */
export function formatMarketingZar(amount, opts = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const whole = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
  if (opts.grouped) {
    return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  return `R${whole}`;
}

/**
 * @param {MarketingPlan} plan
 */
export function marketingAnnualSavingsLabel(plan) {
  if (!plan || plan.contactSales) return null;
  return `Annual: ${formatMarketingZar(plan.annualPriceZar, { grouped: true })} (2 months free)`;
}

/**
 * Signup / admin select labels, e.g. `Starter — R50/mo`.
 * @param {MarketingFamily | string} family
 */
export function marketingPlanSelectLabel(family) {
  const plan = MARKETING_PLANS[/** @type {MarketingFamily} */ (family)];
  if (!plan) return String(family || "");
  if (plan.contactSales) return `${plan.name} — Custom`;
  return `${plan.name} — ${formatMarketingZar(plan.monthlyPriceZar)}/mo`;
}

/**
 * Self-serve families in marketing order (no Enterprise).
 */
export function marketingSelfServeFamilies() {
  return MARKETING_PLAN_ORDER.filter((f) => !MARKETING_PLANS[f].contactSales);
}
