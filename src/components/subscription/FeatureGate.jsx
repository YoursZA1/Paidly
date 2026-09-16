import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lock, Crown } from 'lucide-react';
import Button from '@/components/ui/button';
import { hasFeature, familyForSlug } from '@/lib/plans';

/** Map UI feature keys → canonical plan feature keys (default-deny). */
const FEATURE_ALIASES = {
  invoices: 'invoices',
  quotes: 'quotes',
  clients: 'clients',
  services: 'inventory',
  notes: 'invoices',
  calendar: 'invoices',
  messages: 'invoices',
  recurring: 'recurring_invoices',
  cashflow: 'reports_basic',
  reports: 'reports_basic',
  tasks: 'invoices',
  accounting: 'expenses',
  budgets: 'expenses',
  payroll: 'payslips',
  multicurrency: 'invoices',
  customBranding: 'white_label',
  analytics: 'reports_advanced',
  advancedAccounting: 'vat_reports',
  apiAccess: 'api_access',
  webhooks: 'integrations',
  advancedReports: 'reports_advanced',
  dataExport: 'reports_basic',
  ssoIntegration: 'sso',
  advancedSecurity: 'sso',
  prioritySupport: 'support_priority',
  inventory: 'inventory',
  pos: 'pos',
  expenses: 'expenses',
  purchase_orders: 'purchase_orders',
  payslips: 'payslips',
  leave_management: 'leave_management',
  vat_reports: 'vat_reports',
  email_templates: 'email_templates',
  recurring_invoices: 'recurring_invoices',
  multi_company: 'multi_company',
  white_label: 'white_label',
  integrations: 'integrations',
  api_access: 'api_access',
};

export const FEATURE_TIERS = {
  invoices: ["Starter", "Business", "Growth", "Enterprise"],
  quotes: ["Starter", "Business", "Growth", "Enterprise"],
  clients: ["Starter", "Business", "Growth", "Enterprise"],
  inventory: ["Business", "Growth", "Enterprise"],
  pos: ["Business", "Growth", "Enterprise"],
  recurring: ["Business", "Growth", "Enterprise"],
  payroll: ["Business", "Growth", "Enterprise"],
  advancedReports: ["Growth", "Enterprise"],
  apiAccess: ["Growth", "Enterprise"],
  multi_company: ["Growth", "Enterprise"],
  ssoIntegration: ["Enterprise"],
  customBranding: ["Enterprise"],
};

const FAMILY_LABEL = {
  starter: 'Starter',
  business: 'Business',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

export const getRequiredPlan = (feature) => {
  const key = FEATURE_ALIASES[feature] || feature;
  if (['invoices', 'quotes', 'clients', 'reports_basic', 'email_send'].includes(key)) {
    return 'Starter';
  }
  if (
    [
      'inventory',
      'pos',
      'expenses',
      'purchase_orders',
      'payslips',
      'vat_reports',
      'email_templates',
      'recurring_invoices',
      'support_priority',
    ].includes(key)
  ) {
    return 'Business';
  }
  if (
    ["sso", "dedicated_support", "custom_contract", "white_label"].includes(key)
  ) {
    return "Enterprise";
  }
  return "Growth";
};

export const hasFeatureAccess = (userPlan, feature) => {
  const key = FEATURE_ALIASES[feature] || feature;
  if (!key) return false;
  return hasFeature(userPlan, key);
};

/**
 * Prefer subscription-backed access when SoR is ready.
 * @param {{ ready?: boolean, accessGranted?: boolean | null, planSlug?: string | null, hasFeature?: (f: string) => boolean } | null} ent
 * @param {string} feature
 * @param {string} [profilePlanFallback]
 */
export const hasEntitlementFeatureAccess = (ent, feature, profilePlanFallback) => {
  const key = FEATURE_ALIASES[feature] || feature;
  if (!key) return false;
  if (ent && typeof ent.hasFeature === "function") {
    return ent.hasFeature(key);
  }
  if (ent?.ready) {
    if (!ent.accessGranted) return false;
    return hasFeature(ent.planSlug || ent.planFamily || "none", key);
  }
  return hasFeatureAccess(profilePlanFallback || "none", key);
};

export default function FeatureGate({ children, feature, userPlan, entitlement, fallback }) {
  const hasAccess = entitlement
    ? hasEntitlementFeatureAccess(entitlement, feature, userPlan)
    : hasFeatureAccess(userPlan, feature);

  if (hasAccess) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  const required = getRequiredPlan(feature);
  const displayPlan = entitlement?.ready
    ? entitlement.accessGranted
      ? entitlement.planSlug || entitlement.planFamily || userPlan
      : "none"
    : userPlan;
  const fam = familyForSlug(displayPlan);
  const currentLabel = fam ? FAMILY_LABEL[fam] : displayPlan || "Free";

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <Lock className="h-8 w-8 text-zinc-400" aria-hidden />
      <div>
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">Upgrade required</p>
        <p className="mt-1 text-sm text-zinc-500">
          {required} plan needed for this feature. You are on {currentLabel}.
        </p>
      </div>
      <Button asChild>
        <Link to={`${createPageUrl('Settings')}?tab=subscription`}>
          <Crown className="mr-2 h-4 w-4" />
          View plans
        </Link>
      </Button>
    </div>
  );
}
