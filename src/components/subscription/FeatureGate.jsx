import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lock, Crown } from 'lucide-react';
import Button from '@/components/ui/button';
import { hasFeature } from '@/lib/plans';
import { requiredTierForFeature } from '@shared/planFeatures.js';
import { resolveUpgradeTarget } from '@shared/planUpgrade.js';
import { useEntitlementAccess } from '@/hooks/useEntitlementAccess';
import { describeEntitlementBadge } from '@/lib/clientEntitlement';

/**
 * Map UI feature keys → canonical plan feature keys (shared/planFeatures.js). Default-deny: a key
 * missing from the catalog is allowed nowhere, so new features must be classified there first.
 */
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
  payroll: 'payroll',
  multicurrency: 'invoices',
  customBranding: 'white_label',
  analytics: 'reports_advanced',
  advancedAccounting: 'vat_reports',
  templates: 'templates',
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
  purchaseOrders: 'purchase_orders',
  recurringInvoices: 'recurring_invoices',
  leave_management: 'leave_management',
  vat_reports: 'vat_reports',
  email_templates: 'email_templates',
  recurring_invoices: 'recurring_invoices',
  multi_company: 'multi_company',
  white_label: 'white_label',
  integrations: 'integrations',
  api_access: 'api_access',
};

/**
 * Canonical plan feature key for a UI key (e.g. nav "cashflow" → "reports_basic"). Every client
 * feature check must resolve through this, or an alias reads as "not in any plan" and locks for all.
 * @param {string} feature
 */
export const canonicalFeatureKey = (feature) => FEATURE_ALIASES[feature] || feature;

const FAMILY_LABEL = {
  starter: 'Starter',
  business: 'Business',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

const FAMILY_BY_RANK = ['', 'starter', 'business', 'growth', 'enterprise'];

/**
 * Lowest package that includes the feature, from the shared catalog (shared/planFeatures.js).
 * Catalog fact only — for what to tell a company, use getUpgradeTarget (it starts from their package).
 */
export const getRequiredPlan = (feature) => {
  const key = FEATURE_ALIASES[feature] || feature;
  const family = FAMILY_BY_RANK[requiredTierForFeature(key)];
  return family ? FAMILY_LABEL[family] : 'Enterprise';
};

/**
 * What a company must do to reach `feature`, starting from its own package:
 * nothing / renew its package / upgrade to the next package above that includes it.
 * @param {string} feature UI or canonical feature key
 * @param {{ subscribedPlan?: string | null, accessGranted?: boolean | null } | null | undefined} entitlement
 */
export const getUpgradeTarget = (feature, entitlement) =>
  resolveUpgradeTarget({
    currentPlan: entitlement?.subscribedPlan ?? null,
    accessGranted: entitlement?.accessGranted === true,
    featureKey: FEATURE_ALIASES[feature] || feature,
  });

export const hasFeatureAccess = (userPlan, feature) => {
  const key = FEATURE_ALIASES[feature] || feature;
  if (!key) return false;
  return hasFeature(userPlan, key);
};

/**
 * Gate on the company subscription (useEntitlementAccess). `userPlan` / `entitlement` props are
 * ignored for the decision — kept only so existing callers keep compiling. Server gates still enforce.
 */
export default function FeatureGate({ children, feature, fallback }) {
  const ent = useEntitlementAccess();
  const key = FEATURE_ALIASES[feature] || feature;

  if (ent.hasFeature(key)) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  const target = getUpgradeTarget(feature, ent.entitlement);
  const badge = describeEntitlementBadge(ent.entitlement);
  const currentLabel = badge.plan
    ? `${badge.planLabel}${ent.accessGranted ? '' : ` (${badge.statusLabel.toLowerCase()})`}`
    : 'no active plan';

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <Lock className="h-8 w-8 text-zinc-400" aria-hidden />
      <div>
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
          {target.action === 'renew'
            ? `Renew ${target.planLabel} to continue`
            : target.action === 'none'
              ? 'Not included in your plan'
              : 'Upgrade required'}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {target.action === 'renew'
            ? `This feature is included in ${target.planLabel}. You are on ${currentLabel}.`
            : target.action === 'none'
              ? `This feature is available on a custom Enterprise agreement. You are on ${currentLabel}.`
              : `${target.planLabel} plan needed for this feature. You are on ${currentLabel}.`}
        </p>
      </div>
      {target.label ? (
        <Button asChild>
          <Link to={`${createPageUrl('Settings')}?tab=subscription`}>
            <Crown className="mr-2 h-4 w-4" />
            {target.label}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
