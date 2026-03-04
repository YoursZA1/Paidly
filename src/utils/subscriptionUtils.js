/**
 * Subscription Utilities
 * Helper functions for subscription management
 */

import SubscriptionService from '@/services/SubscriptionService';
import { getPlan, getPlanOrder } from '@/data/planLimits';

// Plan tier mappings
export const PLAN_CATEGORIES = {
  'Individual': ['free', 'starter', 'basic'],
  'SME': ['professional', 'business', 'sme'],
  'Corporate': ['enterprise', 'corporate']
};

const getMonthlyPrice = (planKey) => {
  const plan = getPlan(planKey);
  if (!plan) return 0;
  const monthly = Number(plan.priceMonthly || 0);
  if (monthly > 0) return monthly;
  const yearly = Number(plan.priceYearly || 0);
  return yearly / 12;
};

/**
 * Get category for a plan
 */
export function getPlanCategory(planName) {
  for (const [category, plans] of Object.entries(PLAN_CATEGORIES)) {
    if (plans.includes(planName?.toLowerCase())) {
      return category;
    }
  }
  return 'Individual'; // Default
}

/**
 * Check if plan change is upgrade
 */
export function isUpgrade(fromPlan, toPlan) {
  const order = getPlanOrder();
  const fromIndex = order.indexOf(fromPlan?.toLowerCase() || 'free');
  const toIndex = order.indexOf(toPlan?.toLowerCase() || 'free');
  return toIndex > fromIndex;
}

/**
 * Check if plan change is downgrade
 */
export function isDowngrade(fromPlan, toPlan) {
  const order = getPlanOrder();
  const fromIndex = order.indexOf(fromPlan?.toLowerCase() || 'free');
  const toIndex = order.indexOf(toPlan?.toLowerCase() || 'free');
  return toIndex < fromIndex;
}

/**
 * Calculate MRR difference between plans
 */
export function calculateMRRDifference(fromPlan, toPlan) {
  const fromPrice = getMonthlyPrice(fromPlan?.toLowerCase() || 'free');
  const toPrice = getMonthlyPrice(toPlan?.toLowerCase() || 'free');
  return toPrice - fromPrice;
}

/**
 * Record a subscription upgrade
 */
export function recordUpgrade(userId, userName, userEmail, fromPlan, toPlan) {
  return SubscriptionService.recordActivity({
    type: 'upgrade',
    userId,
    userName,
    userEmail,
    fromPlan,
    toPlan,
    metadata: {
      mrrIncrease: calculateMRRDifference(fromPlan, toPlan)
    }
  });
}

/**
 * Record a subscription downgrade
 */
export function recordDowngrade(userId, userName, userEmail, fromPlan, toPlan, reason = '') {
  return SubscriptionService.recordActivity({
    type: 'downgrade',
    userId,
    userName,
    userEmail,
    fromPlan,
    toPlan,
    reason,
    metadata: {
      mrrDecrease: calculateMRRDifference(fromPlan, toPlan)
    }
  });
}

/**
 * Record a subscription cancellation
 */
export function recordCancellation(userId, userName, userEmail, plan, reason = '') {
  return SubscriptionService.recordActivity({
    type: 'cancel',
    userId,
    userName,
    userEmail,
    fromPlan: plan,
    reason,
    metadata: {
      mrrLoss: getMonthlyPrice(plan?.toLowerCase() || 'free')
    }
  });
}

/**
 * Record a subscription reactivation
 */
export function recordReactivation(userId, userName, userEmail, plan) {
  return SubscriptionService.recordActivity({
    type: 'reactivate',
    userId,
    userName,
    userEmail,
    toPlan: plan,
    metadata: {
      mrrRecovered: getMonthlyPrice(plan?.toLowerCase() || 'free')
    }
  });
}

/**
 * Record a subscription extension
 */
export function recordExtension(userId, userName, userEmail, plan, duration = 'month') {
  return SubscriptionService.recordActivity({
    type: 'extend',
    userId,
    userName,
    userEmail,
    toPlan: plan,
    metadata: {
      duration
    }
  });
}

/**
 * Get subscription health indicator
 */
export function getSubscriptionHealth(metrics) {
  if (!metrics) return 'unknown';
  
  const churnRate = metrics.churnRate || 0;
  const netMovement = metrics.metrics30Days?.netMovement || 0;
  
  if (churnRate <= 5 && netMovement > 0) {
    return 'excellent';
  } else if (churnRate <= 10 && netMovement >= 0) {
    return 'good';
  } else if (churnRate <= 15) {
    return 'fair';
  } else {
    return 'poor';
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status) {
  const colors = {
    'active': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
    'paused': 'bg-yellow-100 text-yellow-800',
    'trial': 'bg-purple-100 text-purple-800',
    'inactive': 'bg-gray-100 text-gray-800'
  };
  return colors[status] || colors.inactive;
}

/**
 * Get activity type icon colors
 */
export function getActivityColor(type) {
  const colors = {
    'upgrade': 'text-green-500',
    'downgrade': 'text-orange-500',
    'cancel': 'text-red-500',
    'reactivate': 'text-primary',
    'extend': 'text-purple-500'
  };
  return colors[type] || 'text-gray-500';
}

/**
 * Get activity type label
 */
export function getActivityLabel(type) {
  const labels = {
    'upgrade': 'Upgrade',
    'downgrade': 'Downgrade',
    'cancel': 'Cancellation',
    'reactivate': 'Reactivation',
    'extend': 'Extension'
  };
  return labels[type] || type;
}

/**
 * Format currency
 */
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amount);
}

/**
 * Get retention rate for a cohort
 */
export function calculateRetentionRate(signupCount, activeCount) {
  if (signupCount === 0) return 0;
  return Math.round((activeCount / signupCount) * 100);
}

/**
 * Get churn rate
 */
export function calculateChurnRate(cancelledCount, activeCount) {
  if (activeCount === 0) return 0;
  return Math.round((cancelledCount / activeCount) * 100);
}

/**
 * Get LTV (Lifetime Value) estimate
 */
export function calculateLTV(arpu, monthlyChurnRate) {
  if (monthlyChurnRate === 0) {
    return arpu * 12; // Assume 12 months retention
  }
  return Math.round(arpu / monthlyChurnRate);
}

/**
 * Get CAC payback period (in months)
 */
export function calculateCACPayback(cac, arpu, monthlyMargin = 0.8) {
  if (arpu * monthlyMargin === 0) return -1;
  return Math.round(cac / (arpu * monthlyMargin));
}

export default {
  getPlanCategory,
  isUpgrade,
  isDowngrade,
  calculateMRRDifference,
  recordUpgrade,
  recordDowngrade,
  recordCancellation,
  recordReactivation,
  recordExtension,
  getSubscriptionHealth,
  getStatusColor,
  getActivityColor,
  getActivityLabel,
  formatCurrency,
  calculateRetentionRate,
  calculateChurnRate,
  calculateLTV,
  calculateCACPayback
};
