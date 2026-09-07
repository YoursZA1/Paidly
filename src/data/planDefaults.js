import { FAMILY_LIMITS } from "@shared/planFeatures.js";
import { MARKETING_PLANS } from "@shared/planMarketing.js";

export const FEATURE_CATALOG = [
  { key: "invoices", label: "Invoices", description: "Create and manage invoices" },
  { key: "quotes", label: "Quotes", description: "Create and manage quotes" },
  { key: "clients", label: "Clients", description: "Manage client records" },
  { key: "services", label: "Services", description: "Offer services and rate cards" },
  { key: "notes", label: "Notes", description: "Personal and shared notes" },
  { key: "calendar", label: "Calendar", description: "Calendar views and reminders" },
  { key: "messages", label: "Messages", description: "Internal messaging" },
  { key: "recurring", label: "Recurring", description: "Recurring invoices and schedules" },
  { key: "cashflow", label: "Cash Flow", description: "Cash flow dashboards" },
  { key: "reports", label: "Reports", description: "Financial reports" },
  { key: "tasks", label: "Tasks", description: "Task management" },
  { key: "accounting", label: "Accounting", description: "Accounting modules" },
  { key: "budgets", label: "Budgets", description: "Budget planning" },
  { key: "payroll", label: "Payroll", description: "Payroll and payslips" },
  { key: "multicurrency", label: "Multi-Currency", description: "Multi-currency invoicing" },
  { key: "customBranding", label: "Custom Branding", description: "Custom PDF branding" },
  { key: "analytics", label: "Analytics", description: "Analytics dashboards" },
  { key: "advancedAccounting", label: "Advanced Accounting", description: "Advanced accounting workflows" },
  { key: "apiAccess", label: "API Access", description: "API access and keys" },
  { key: "webhooks", label: "Webhooks", description: "Webhook integrations" },
  { key: "advancedReports", label: "Advanced Reports", description: "Advanced reporting tools" },
  { key: "dataExport", label: "Data Export", description: "Export data and backups" },
  { key: "ssoIntegration", label: "SSO Integration", description: "Single sign-on" },
  { key: "advancedSecurity", label: "Advanced Security", description: "Advanced security controls" },
  { key: "prioritySupport", label: "Priority Support", description: "Priority support channels" }
];

/** Public catalog order. `free` stays in DEFAULT_PLANS as a local-admin fallback only. */
export const PLAN_ORDER = ["starter", "business", "growth", "enterprise"];

export const createDefaultFeatures = (overrides = {}) => {
  const features = FEATURE_CATALOG.reduce((acc, feature) => {
    acc[feature.key] = true;
    return acc;
  }, {});

  return { ...features, ...overrides };
};

function seatFields(family) {
  const seats = FAMILY_LIMITS[family]?.seats;
  const unlimited = seats == null;
  return {
    userLimit: unlimited ? null : seats,
    users: unlimited ? "Unlimited" : seats,
  };
}

function catalogPlan(family, extras) {
  const copy = MARKETING_PLANS[family];
  return {
    name: copy.name,
    ...seatFields(family),
    invoices_limit: "Unlimited",
    quotes_limit: "Unlimited",
    storage: extras.storage,
    color: extras.color,
    description: copy.description,
    nextTierName: extras.nextTierName,
    priceMonthly: copy.contactSales ? 0 : copy.monthlyPriceZar,
    priceYearly: copy.contactSales ? 0 : copy.annualPriceZar,
    recommended: Boolean(copy.highlighted),
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: "",
  };
}

export const DEFAULT_PLANS = {
  free: {
    name: "Free",
    userLimit: 1,
    users: 1,
    invoices_limit: 10,
    quotes_limit: 5,
    storage: "1GB",
    color: "bg-gray-100",
    description: "Trial fallback",
    nextTierName: "Starter",
    priceMonthly: 0,
    priceYearly: 0,
    recommended: false,
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: "",
  },
  starter: catalogPlan("starter", {
    storage: "10GB",
    color: "bg-primary/15",
    nextTierName: "Business",
  }),
  business: catalogPlan("business", {
    storage: "50GB",
    color: "bg-primary/10",
    nextTierName: "Growth",
  }),
  growth: catalogPlan("growth", {
    storage: "100GB",
    color: "bg-purple-100",
    nextTierName: "Enterprise",
  }),
  enterprise: catalogPlan("enterprise", {
    storage: "Unlimited",
    color: "bg-amber-100",
    nextTierName: null,
  }),
};
