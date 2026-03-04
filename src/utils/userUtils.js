/**
 * User Management Utilities
 * Helper functions for user status, formatting, and validation
 */

export const USER_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TRIAL: 'trial'
};

export const USER_ROLES = {
  ADMIN: 'admin',
  SUPPORT: 'support',
  USER: 'user'
};

export const PLAN_TYPES = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise'
};

export const PLAN_LIMITS = {
  free: {
    name: 'Free',
    clients: 5,
    users: 1,
    documents: 50,
    storage: 1, // GB
    color: 'slate'
  },
  starter: {
    name: 'Starter',
    clients: 50,
    users: 3,
    documents: 500,
    storage: 10,
    color: 'blue'
  },
  professional: {
    name: 'Professional',
    clients: 500,
    users: 10,
    documents: 5000,
    storage: 100,
    color: 'purple'
  },
  enterprise: {
    name: 'Enterprise',
    clients: -1, // Unlimited
    users: -1,
    documents: -1,
    storage: -1,
    color: 'gold'
  }
};

/**
 * Get status badge styling
 */
export const getStatusColor = (status) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    trial: 'bg-yellow-100 text-yellow-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get status display text
 */
export const getStatusLabel = (status) => {
  const labels = {
    active: 'Active',
    suspended: 'Suspended',
    trial: 'Trial'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get plan display name
 */
export const getPlanLabel = (plan) => {
  return PLAN_LIMITS[plan]?.name || 'Unknown Plan';
};

/**
 * Get plan color
 */
export const getPlanColor = (plan) => {
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
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format date to relative time (e.g., "2 hours ago")
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
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
export const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain number' };
  }
  return { valid: true, message: 'Password is strong' };
};

/**
 * Calculate account age in days
 */
export const getAccountAgeDays = (createdAt) => {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Check if trial account is about to expire (within 3 days)
 */
export const isTrialExpiringSoon = (trialEndsAt) => {
  if (!trialEndsAt) return false;
  const expiryDate = new Date(trialEndsAt);
  const now = new Date();
  const daysUntilExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry <= 3 && daysUntilExpiry > 0;
};

/**
 * Get usage percentage color
 */
export const getUsageColor = (percentage) => {
  if (percentage >= 90) return 'text-red-600';
  if (percentage >= 70) return 'text-yellow-600';
  return 'text-green-600';
};

/**
 * Get usage bar color
 */
export const getUsageBarColor = (percentage) => {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
};

/**
 * Format storage size
 */
export const formatStorageSize = (gb) => {
  if (gb < 0) return 'Unlimited';
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb} GB`;
};

/**
 * Calculate days until trial expires
 */
export const getDaysUntilTrialExpiry = (trialEndsAt) => {
  if (!trialEndsAt) return null;
  const expiryDate = new Date(trialEndsAt);
  const now = new Date();
  const daysUntilExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(daysUntilExpiry));
};

/**
 * Get role badge styling
 */
export const getRoleBadgeColor = (role) => {
  const colors = {
    admin: 'bg-purple-100 text-purple-800',
    support: 'bg-primary/15 text-primary',
    user: 'bg-gray-100 text-gray-800'
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
};

/**
 * Get last login status (active, idle, inactive)
 */
export const getLastLoginStatus = (lastLogin) => {
  if (!lastLogin) return 'Never logged in';
  
  const date = new Date(lastLogin);
  const now = new Date();
  const hoursAgo = (now - date) / (1000 * 60 * 60);

  if (hoursAgo < 1) return 'Active now';
  if (hoursAgo < 24) return 'Active today';
  if (hoursAgo < 168) return 'Active this week';
  if (hoursAgo < 720) return 'Active this month';
  
  return 'Inactive';
};

/**
 * Get last login status badge color
 */
export const getLastLoginStatusColor = (lastLogin) => {
  if (!lastLogin) return 'bg-gray-100 text-gray-800';
  
  const date = new Date(lastLogin);
  const now = new Date();
  const hoursAgo = (now - date) / (1000 * 60 * 60);

  if (hoursAgo < 24) return 'bg-green-100 text-green-800';
  if (hoursAgo < 168) return 'bg-yellow-100 text-yellow-800';
  
  return 'bg-red-100 text-red-800';
};

/**
 * Export user data to JSON
 */
export const exportUserDataAsJSON = (data, filename = 'user_data.json') => {
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
 * Get chart data for user distribution
 */
export const getChartDataForUsersByPlan = (usersPerPlan) => {
  return Object.entries(usersPerPlan)
    .filter(([, data]) => data.count > 0)
    .map(([plan, data]) => ({
      name: getPlanLabel(plan),
      value: data.count,
      fill: `hsl(var(--color-${plan}))`
    }));
};

/**
 * Get chart data for user status distribution
 */
export const getChartDataForUserStatus = (statusBreakdown) => {
  return [
    {
      name: 'Active',
      value: statusBreakdown.active,
      fill: '#22c55e'
    },
    {
      name: 'Trial',
      value: statusBreakdown.trial,
      fill: '#eab308'
    },
    {
      name: 'Suspended',
      value: statusBreakdown.suspended,
      fill: '#ef4444'
    }
  ].filter(item => item.value > 0);
};
