/**
 * Accounts Management Utilities
 * Helper functions for account status, formatting, and calculations
 */

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  TRIAL: 'trial'
};

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  PENDING: 'pending'
};

export const ACCOUNT_HEALTH = {
  NORMAL: 'normal',
  HIGH_USAGE: 'high_usage',
  FLAGGED: 'flagged'
};

export const BILLING_CYCLES = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

export const PLAN_TYPES = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise'
};

/**
 * Get account status badge styling
 */
export const getAccountStatusColor = (status) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    suspended: 'bg-red-100 text-red-800',
    trial: 'bg-yellow-100 text-yellow-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get account status label
 */
export const getAccountStatusLabel = (status) => {
  const labels = {
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended',
    trial: 'Trial'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get subscription status label
 */
export const getSubscriptionStatusLabel = (status) => {
  const labels = {
    active: 'Active',
    paused: 'Paused',
    cancelled: 'Cancelled',
    pending: 'Pending'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get subscription status color
 */
export const getSubscriptionStatusColor = (status) => {
  const colors = {
    active: 'bg-blue-100 text-blue-800',
    paused: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800',
    pending: 'bg-purple-100 text-purple-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get account health badge styling
 */
export const getAccountHealthColor = (health) => {
  const colors = {
    normal: 'bg-green-100 text-green-800',
    high_usage: 'bg-yellow-100 text-yellow-800',
    flagged: 'bg-red-100 text-red-800'
  };
  return colors[health] || 'bg-gray-100 text-gray-800';
};

/**
 * Get account health label
 */
export const getAccountHealthLabel = (health) => {
  const labels = {
    normal: 'Normal',
    high_usage: 'High Usage',
    flagged: 'Flagged'
  };
  return labels[health] || 'Unknown';
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
 * Format date to relative time
 */
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Format currency (South African Rands)
 */
export const formatCurrency = (amount, currency = 'ZAR') => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

/**
 * Calculate storage percentage
 */
export const calculateStoragePercent = (used, limit) => {
  if (!limit) return 0;
  return Math.round((used / limit) * 100);
};

/**
 * Calculate document percentage
 */
export const calculateDocumentPercent = (used, limit) => {
  if (!limit) return 0;
  return Math.round((used / limit) * 100);
};

/**
 * Get storage bar color based on usage
 */
export const getStorageBarColor = (percent) => {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
};

/**
 * Get usage text color based on percentage
 */
export const getUsageTextColor = (percent) => {
  if (percent >= 90) return 'text-red-600';
  if (percent >= 70) return 'text-yellow-600';
  return 'text-green-600';
};

/**
 * Format plan type label
 */
export const getPlanTypeLabel = (planType) => {
  const labels = {
    free: 'Free',
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
    custom: 'Custom'
  };
  return labels[planType] || 'Unknown';
};

/**
 * Get plan color
 */
export const getPlanColor = (plan) => {
  const colors = {
    free: 'bg-slate-100 text-slate-800',
    starter: 'bg-blue-100 text-blue-800',
    professional: 'bg-purple-100 text-purple-800',
    enterprise: 'bg-yellow-100 text-yellow-800',
    custom: 'bg-pink-100 text-pink-800'
  };
  return colors[plan] || 'bg-gray-100 text-gray-800';
};

/**
 * Get billing cycle label
 */
export const getBillingCycleLabel = (cycle) => {
  const labels = {
    monthly: 'Monthly',
    yearly: 'Yearly'
  };
  return labels[cycle] || 'Unknown';
};

/**
 * Calculate days until renewal
 */
export const calculateDaysUntilRenewal = (renewalDate) => {
  if (!renewalDate) return null;
  const renewal = new Date(renewalDate);
  const now = new Date();
  const days = Math.ceil((renewal - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

/**
 * Check if renewal is upcoming (within 7 days)
 */
export const isRenewalUpcoming = (renewalDate) => {
  const days = calculateDaysUntilRenewal(renewalDate);
  return days !== null && days > 0 && days <= 7;
};

/**
 * Check if renewal is overdue
 */
export const isRenewalOverdue = (renewalDate) => {
  const days = calculateDaysUntilRenewal(renewalDate);
  return days !== null && days < 0;
};

/**
 * Get account age in days
 */
export const getAccountAgeDays = (createdAt) => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Get all discounts total
 */
export const getTotalDiscounts = (account) => {
  if (!account.discounts || account.discounts.length === 0) return 0;
  return account.discounts.reduce((sum, d) => sum + d.percent, 0);
};

/**
 * Calculate estimated annual value
 */
export const calculateAnnualValue = (monthlyRate, discountPercent = 0) => {
  const annualRate = monthlyRate * 12;
  const discountAmount = annualRate * (discountPercent / 100);
  return annualRate - discountAmount;
};

/**
 * Get payment status color
 */
export const getPaymentStatusColor = (status) => {
  const colors = {
    successful: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-blue-100 text-blue-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get MRR (Monthly Recurring Revenue)
 */
export const calculateMRR = (accounts) => {
  return accounts
    .filter(a => a.status === 'active' && a.subscription_status === 'active')
    .reduce((sum, a) => sum + (a.monthly_rate || 0), 0);
};

/**
 * Get chart data for accounts by plan
 */
export const getChartDataByPlan = (accounts) => {
  const planCounts = {};
  
  accounts.forEach(account => {
    planCounts[account.plan] = (planCounts[account.plan] || 0) + 1;
  });

  return Object.entries(planCounts).map(([plan, count]) => ({
    name: getPlanTypeLabel(plan),
    value: count,
    fill: plan === 'enterprise' ? '#fbbf24' : 
          plan === 'professional' ? '#a78bfa' : 
          plan === 'starter' ? '#60a5fa' : '#e2e8f0'
  }));
};

/**
 * Get chart data for account health distribution
 */
export const getChartDataByHealth = (accounts, healthCounts) => {
  return [
    {
      name: 'Normal',
      value: healthCounts.normal || 0,
      fill: '#10b981'
    },
    {
      name: 'High Usage',
      value: healthCounts.high_usage || 0,
      fill: '#f59e0b'
    },
    {
      name: 'Flagged',
      value: healthCounts.flagged || 0,
      fill: '#ef4444'
    }
  ].filter(item => item.value > 0);
};

/**
 * Export account data to JSON
 */
export const exportAccountDataAsJSON = (data, filename = 'accounts_data.json') => {
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
 * Get subscription renewal status badge
 */
export const getRenewalStatusBadge = (renewalDate) => {
  const days = calculateDaysUntilRenewal(renewalDate);
  
  if (days === null) return { label: 'Unknown', color: 'gray' };
  if (days < 0) return { label: 'Overdue', color: 'red' };
  if (days === 0) return { label: 'Renews Today', color: 'yellow' };
  if (days <= 7) return { label: `Renews in ${days}d`, color: 'yellow' };
  
  return { label: `Renews in ${days}d`, color: 'green' };
};
