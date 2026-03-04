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

export const PLAN_ORDER = ["free", "starter", "professional", "enterprise"];

export const createDefaultFeatures = (overrides = {}) => {
  const features = FEATURE_CATALOG.reduce((acc, feature) => {
    acc[feature.key] = true;
    return acc;
  }, {});

  return { ...features, ...overrides };
};

export const DEFAULT_PLANS = {
  free: {
    name: "Free",
    userLimit: 1,
    users: 1,
    invoices_limit: 10,
    quotes_limit: 5,
    storage: "1GB",
    color: "bg-gray-100",
    description: "Just you",
    nextTierName: "Starter",
    priceMonthly: 0,
    priceYearly: 0,
    recommended: false,
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: ""
  },
  starter: {
    name: "Starter",
    userLimit: 3,
    users: 3,
    invoices_limit: 50,
    quotes_limit: 25,
    storage: "10GB",
    color: "bg-primary/15",
    description: "You + 2 team members",
    nextTierName: "Professional",
    priceMonthly: 29,
    priceYearly: 290,
    recommended: true,
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: ""
  },
  professional: {
    name: "Professional",
    userLimit: 10,
    users: 10,
    invoices_limit: 500,
    quotes_limit: 250,
    storage: "100GB",
    color: "bg-primary/10",
    description: "You + 9 team members",
    nextTierName: "Enterprise",
    priceMonthly: 99,
    priceYearly: 990,
    recommended: false,
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: ""
  },
  enterprise: {
    name: "Enterprise",
    userLimit: null,
    users: "Unlimited",
    invoices_limit: "Unlimited",
    quotes_limit: "Unlimited",
    storage: "Unlimited",
    color: "bg-purple-100",
    description: "Unlimited team members",
    nextTierName: null,
    priceMonthly: 299,
    priceYearly: 2990,
    recommended: false,
    status: "active",
    features: createDefaultFeatures(),
    version: 1,
    createdAt: "",
    updatedAt: ""
  }
};
