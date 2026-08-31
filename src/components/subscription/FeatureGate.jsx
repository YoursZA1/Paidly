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
  vat_reports: 'vat_reports',
  email_templates: 'email_templates',
  recurring_invoices: 'recurring_invoices',
  multi_company: 'multi_company',
  white_label: 'white_label',
  integrations: 'integrations',
  api_access: 'api_access',
};

export const FEATURE_TIERS = {
  invoices: ['Starter', 'Business', 'Growth'],
  quotes: ['Starter', 'Business', 'Growth'],
  clients: ['Starter', 'Business', 'Growth'],
  inventory: ['Business', 'Growth'],
  pos: ['Business', 'Growth'],
  recurring: ['Business', 'Growth'],
  payroll: ['Business', 'Growth'],
  advancedReports: ['Growth'],
  apiAccess: ['Growth'],
  multi_company: ['Growth'],
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
  return 'Growth';
};

export const hasFeatureAccess = (userPlan, feature) => {
  const key = FEATURE_ALIASES[feature] || feature;
  if (!key) return false;
  return hasFeature(userPlan, key);
};

export default function FeatureGate({ children, feature, userPlan, fallback }) {
  const hasAccess = hasFeatureAccess(userPlan, feature);

  if (hasAccess) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  const required = getRequiredPlan(feature);
  const fam = familyForSlug(userPlan);
  const currentLabel = fam ? FAMILY_LABEL[fam] : userPlan || 'Free';

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
