/**
 * Subscription Management Utilities
 * Helper functions for subscription status, formatting, calculations, and analytics
 */

import PlanManagementService from "@/services/PlanManagementService";
import { getPlan } from "@/data/planLimits";

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  PAUSED: 'paused',
  CANCELLED: 'cancelled'
};

export const PAYMENT_STATUSES = {
  SUCCEEDED: 'succeeded',
  PENDING: 'pending',
  FAILED: 'failed'
};

export const BILLING_CYCLES = {
  MONTHLY: 'monthly',
  ANNUAL: 'annual'
};

export const DISCOUNT_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed'
};

export const getPlanPrice = (planKey, cycle = 'monthly') => {
  const plan = PlanManagementService.getPlan(planKey) || getPlan(planKey);
  if (!plan) return 0;

  if (cycle === 'annual' || cycle === 'yearly') {
    return Number(plan.priceYearly || 0);
  }

  return Number(plan.priceMonthly || 0);
};

export const getPlanLimits = (planKey) => {
  const plan = getPlan(planKey);
  if (!plan) return null;

  return {
    name: plan.name || 'Unknown',
    users: plan.userLimit ?? plan.users,
    invoices: plan.invoices_limit,
    quotes: plan.quotes_limit,
    storage: plan.storage
  };
};

/**
 * Get subscription status badge styling
 */
export const getStatusBadgeColor = (status) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-primary/15 text-primary',
    paused: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get payment status badge styling
 */
export const getPaymentStatusBadgeColor = (status) => {
  const colors = {
    succeeded: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get status display label
 */
export const getStatusLabel = (status) => {
  const labels = {
    active: 'Active',
    trial: 'Trial',
    paused: 'Paused',
    cancelled: 'Cancelled'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get payment status label
 */
export const getPaymentStatusLabel = (status) => {
  const labels = {
    succeeded: 'Succeeded',
    pending: 'Pending',
    failed: 'Failed'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get billing cycle label
 */
export const getBillingCycleLabel = (cycle) => {
  const labels = {
    monthly: 'Monthly',
    annual: 'Annual'
  };
  return labels[cycle] || 'Unknown';
};

/**
 * Get plan name and styling
 */
export const getPlanInfo = (planKey) => {
  const plan = PlanManagementService.getPlan(planKey) || getPlan(planKey);
  const limits = getPlanLimits(planKey);

  return {
    name: plan?.name || 'Unknown',
    price: getPlanPrice(planKey, 'monthly'),
    priceMonthly: getPlanPrice(planKey, 'monthly'),
    priceYearly: getPlanPrice(planKey, 'annual'),
    limits: limits
  };
};

/**
 * Get plan color badge
 */
export const getPlanBadgeColor = (plan) => {
  const colors = {
    free: 'bg-slate-100 text-slate-800',
    starter: 'bg-primary/15 text-primary',
    professional: 'bg-purple-100 text-purple-800',
    enterprise: 'bg-yellow-100 text-yellow-800'
  };
  return colors[plan] || 'bg-gray-100 text-gray-800';
};

/**
 * Format date for display
 */
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format date with time
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format currency (South African Rands)
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount);
};

/**
 * Calculate days until renewal
 */
export const getDaysUntilRenewal = (renewalDate) => {
  if (!renewalDate) return null;
  const renewal = new Date(renewalDate);
  const now = new Date();
  return Math.ceil((renewal - now) / (1000 * 60 * 60 * 24));
};

/**
 * Calculate billing cycle progress percentage
 */
export const calculateCycleProgress = (cycleStart, renewalDate) => {
  if (!cycleStart || !renewalDate) return 0;
  const start = new Date(cycleStart);
  const renewal = new Date(renewalDate);
  const now = new Date();
  
  if (now >= renewal) return 100;
  if (now <= start) return 0;
  
  return Math.round(((now - start) / (renewal - start)) * 100);
};

/**
 * Calculate total discount amount
 */
export const calculateTotalDiscount = (basePrice, discounts) => {
  if (!discounts || discounts.length === 0) return 0;
  
  let discountedPrice = basePrice;
  
  discounts.forEach(discount => {
    if (discount.type === 'percentage') {
      discountedPrice = discountedPrice * (1 - discount.value / 100);
    } else if (discount.type === 'fixed') {
      discountedPrice = Math.max(0, discountedPrice - discount.value);
    }
  });
  
  return basePrice - discountedPrice;
};

/**
 * Calculate effective price after discounts
 */
export const calculateEffectivePrice = (basePrice, discounts) => {
  if (!discounts || discounts.length === 0) return basePrice;
  
  let price = basePrice;
  
  discounts.forEach(discount => {
    if (discount.type === 'percentage') {
      price = price * (1 - discount.value / 100);
    } else if (discount.type === 'fixed') {
      price = Math.max(0, price - discount.value);
    }
  });
  
  return price;
};

/**
 * Check if subscription is about to renew
 */
export const isRenewingSoon = (renewalDate, daysThreshold = 7) => {
  const daysUntil = getDaysUntilRenewal(renewalDate);
  return daysUntil !== null && daysUntil <= daysThreshold && daysUntil > 0;
};

/**
 * Check if subscription is past due
 */
export const isPastDue = (renewalDate) => {
  const daysUntil = getDaysUntilRenewal(renewalDate);
  return daysUntil !== null && daysUntil <= 0;
};

/**
 * Get renewal status color
 */
export const getRenewalStatusColor = (renewalDate) => {
  if (isPastDue(renewalDate)) return 'text-red-600';
  if (isRenewingSoon(renewalDate, 3)) return 'text-red-600';
  if (isRenewingSoon(renewalDate)) return 'text-yellow-600';
  return 'text-green-600';
};

/**
 * Get renewal status text
 */
export const getRenewalStatusText = (renewalDate) => {
  const daysUntil = getDaysUntilRenewal(renewalDate);
  
  if (daysUntil === null) return 'Unknown';
  if (daysUntil <= 0) return 'Past Due';
  if (daysUntil === 1) return 'Renews tomorrow';
  if (daysUntil <= 7) return `Renews in ${daysUntil} days`;
  
  return formatDate(renewalDate);
};

/**
 * Calculate MRR (Monthly Recurring Revenue)
 */
export const calculateMRR = (subscriptions, plan = null) => {
  if (!subscriptions || subscriptions.length === 0) return 0;
  
  let total = 0;
  
  subscriptions.forEach(sub => {
    if (sub.status !== 'active') return;
    if (plan && sub.currentPlan !== plan) return;
    
    const cycle = sub.billingCycle === 'annual' ? 'annual' : 'monthly';
    const price = sub.customPrice || getPlanPrice(sub.currentPlan, cycle) || 0;
    
    if (cycle === 'monthly') {
      total += price;
    } else if (cycle === 'annual') {
      total += price / 12;
    }
  });
  
  return Math.round(total * 100) / 100;
};

/**
 * Calculate ARR (Annual Recurring Revenue)
 */
export const calculateARR = (subscriptions, plan = null) => {
  return calculateMRR(subscriptions, plan) * 12;
};

/**
 * Get subscription metrics
 */
export const getSubscriptionMetrics = (subscriptions) => {
  const metrics = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active').length,
    trial: subscriptions.filter(s => s.status === 'trial').length,
    paused: subscriptions.filter(s => s.status === 'paused').length,
    cancelled: subscriptions.filter(s => s.status === 'cancelled').length,
    activeDaysAgo7: 0,
    activeDaysAgo30: 0,
    churnRate: 0
  };
  
  const now = new Date();
  const daysAgo7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const daysAgo30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  metrics.activeDaysAgo7 = subscriptions.filter(s => {
    const created = new Date(s.createdAt);
    return created < daysAgo7;
  }).length;
  
  metrics.activeDaysAgo30 = subscriptions.filter(s => {
    const created = new Date(s.createdAt);
    return created < daysAgo30;
  }).length;
  
  // Churn rate calculation
  const cancelled = subscriptions.filter(s => s.status === 'cancelled').length;
  const activeStart = subscriptions.filter(s => {
    const created = new Date(s.createdAt);
    return created < daysAgo30;
  }).length;
  
  metrics.churnRate = activeStart > 0 ? (cancelled / activeStart * 100).toFixed(2) : 0;
  
  return metrics;
};

/**
 * Export subscription data to JSON
 */
export const exportSubscriptionDataAsJSON = (data, filename = 'subscriptions.json') => {
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Get discount description
 */
export const getDiscountDescription = (discount) => {
  if (discount.type === 'percentage') {
    return `${discount.value}% off`;
  } else if (discount.type === 'fixed') {
    return `${formatCurrency(discount.value)} off`;
  }
  return 'Discount applied';
};

/**
 * Filter subscriptions by criteria
 */
export const filterSubscriptions = (subscriptions, filters) => {
  let filtered = [...subscriptions];
  
  if (filters.status) {
    filtered = filtered.filter(s => s.status === filters.status);
  }
  
  if (filters.plan) {
    filtered = filtered.filter(s => s.currentPlan === filters.plan);
  }
  
  if (filters.billingCycle) {
    filtered = filtered.filter(s => s.billingCycle === filters.billingCycle);
  }
  
  if (filters.paymentStatus) {
    filtered = filtered.filter(s => s.paymentStatus === filters.paymentStatus);
  }
  
  if (filters.search) {
    const query = filters.search.toLowerCase();
    filtered = filtered.filter(s =>
      s.userName.toLowerCase().includes(query) ||
      s.userEmail.toLowerCase().includes(query)
    );
  }
  
  return filtered;
};

/**
 * Sort subscriptions
 */
export const sortSubscriptions = (subscriptions, sortBy = 'createdAt', order = 'desc') => {
  const sorted = [...subscriptions];
  
  sorted.sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy) {
      case 'name':
        aVal = a.userName.toLowerCase();
        bVal = b.userName.toLowerCase();
        break;
      case 'plan':
        aVal = a.currentPlan;
        bVal = b.currentPlan;
        break;
      case 'renewal':
        aVal = new Date(a.renewalDate);
        bVal = new Date(b.renewalDate);
        break;
      case 'amount': {
        const aCycle = a.billingCycle === 'annual' ? 'annual' : 'monthly';
        const bCycle = b.billingCycle === 'annual' ? 'annual' : 'monthly';
        aVal = a.customPrice || getPlanPrice(a.currentPlan, aCycle) || 0;
        bVal = b.customPrice || getPlanPrice(b.currentPlan, bCycle) || 0;
        break;
      }
      case 'createdAt':
      default:
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
    }
    
    if (typeof aVal === 'string') {
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return order === 'asc' ? aVal - bVal : bVal - aVal;
  });
  
  return sorted;
};
