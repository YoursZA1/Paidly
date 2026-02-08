import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlan, getPlanOrder } from '@/data/planLimits';

// Feature to Package mapping
// All plans have full access to all features
// Individual, SME, Corporate: Full feature access

export const FEATURE_TIERS = {
    // All features available to all plans
    invoices: ['Individual', 'SME', 'Corporate'],
    quotes: ['Individual', 'SME', 'Corporate'],
    clients: ['Individual', 'SME', 'Corporate'],
    services: ['Individual', 'SME', 'Corporate'],
    notes: ['Individual', 'SME', 'Corporate'],
    calendar: ['Individual', 'SME', 'Corporate'],
    messages: ['Individual', 'SME', 'Corporate'],
    recurring: ['Individual', 'SME', 'Corporate'],
    cashflow: ['Individual', 'SME', 'Corporate'],
    reports: ['Individual', 'SME', 'Corporate'],
    tasks: ['Individual', 'SME', 'Corporate'],
    accounting: ['Individual', 'SME', 'Corporate'],
    budgets: ['Individual', 'SME', 'Corporate'],
    payroll: ['Individual', 'SME', 'Corporate'],
    multicurrency: ['Individual', 'SME', 'Corporate'],
    customBranding: ['Individual', 'SME', 'Corporate'],
    analytics: ['Individual', 'SME', 'Corporate'],
    advancedAccounting: ['Individual', 'SME', 'Corporate'],
    apiAccess: ['Individual', 'SME', 'Corporate'],
    webhooks: ['Individual', 'SME', 'Corporate'],
    advancedReports: ['Individual', 'SME', 'Corporate'],
    dataExport: ['Individual', 'SME', 'Corporate'],
    ssoIntegration: ['Individual', 'SME', 'Corporate'],
    advancedSecurity: ['Individual', 'SME', 'Corporate'],
    prioritySupport: ['Individual', 'SME', 'Corporate']
};

const normalizePlan = (plan) => (plan || '').toString().trim().toLowerCase();

export const getRequiredPlan = (feature) => {
    const planOrder = getPlanOrder();

    for (const planKey of planOrder) {
        const plan = getPlan(planKey);
        if (!plan?.features || !(feature in plan.features)) {
            continue;
        }
        if (plan.features[feature]) {
            return plan.name || planKey;
        }
    }

    const tiers = FEATURE_TIERS[feature];
    if (!tiers || tiers.length === 0) return null;
    return tiers[0];
};

export const hasFeatureAccess = (userPlan, feature) => {
    const planKey = normalizePlan(userPlan) || 'free';
    const plan = getPlan(planKey);

    if (plan?.features && feature in plan.features) {
        return Boolean(plan.features[feature]);
    }

    return true;
};

export default function FeatureGate({ children, feature, userPlan, fallback }) {
    const hasAccess = hasFeatureAccess(userPlan, feature);
    
    if (hasAccess) {
        return children;
    }
    
    if (fallback) {
        return fallback;
    }
    
    const requiredPlan = getRequiredPlan(feature);
    
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Feature Locked
            </h3>
            <p className="text-slate-600 mb-4 max-w-sm">
                This feature requires the <span className="font-semibold text-indigo-600">{requiredPlan}</span> plan or higher.
            </p>
            <Link to={createPageUrl('Settings') + '?tab=subscription'}>
                <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade Plan
                </Button>
            </Link>
        </div>
    );
}

export function LockedNavItem({ title, requiredPlan }) {
    return (
        <div className="flex items-center gap-3 rounded-lg px-4 py-3 text-white/40 cursor-not-allowed">
            <Lock className="h-4 w-4" />
            <span>{title}</span>
            <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded">{requiredPlan}</span>
        </div>
    );
}