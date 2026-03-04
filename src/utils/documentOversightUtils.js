/**
 * Document Oversight Utilities
 * Helper functions for document analysis and formatting
 */

export const USER_ENGAGEMENT_LEVELS = {
  POWER_USER: 'power_user', // 50+ documents
  REGULAR_USER: 'regular_user', // 10-49 documents
  OCCASIONAL_USER: 'occasional_user', // 1-9 documents
  INACTIVE_USER: 'inactive_user' // 0 documents
};

export const DOCUMENT_TYPES = {
  INVOICE: 'invoice',
  QUOTE: 'quote',
  RECEIPT: 'receipt',
  ESTIMATE: 'estimate'
};

export const USER_ACTIVITY_STATUS = {
  ACTIVE: 'active', // Activity in last 7 days
  IDLE: 'idle', // Activity in last 30 days
  INACTIVE: 'inactive' // No activity in 30+ days
};

/**
 * Get user engagement level
 */
export const getUserEngagementLevel = (documentCount) => {
  if (documentCount >= 50) return USER_ENGAGEMENT_LEVELS.POWER_USER;
  if (documentCount >= 10) return USER_ENGAGEMENT_LEVELS.REGULAR_USER;
  if (documentCount > 0) return USER_ENGAGEMENT_LEVELS.OCCASIONAL_USER;
  return USER_ENGAGEMENT_LEVELS.INACTIVE_USER;
};

/**
 * Get engagement level label
 */
export const getEngagementLevelLabel = (level) => {
  const labels = {
    power_user: 'Power User',
    regular_user: 'Regular User',
    occasional_user: 'Occasional User',
    inactive_user: 'Inactive User'
  };
  return labels[level] || 'Unknown';
};

/**
 * Get engagement level badge color
 */
export const getEngagementLevelColor = (level) => {
  const colors = {
    power_user: 'bg-purple-100 text-purple-800',
    regular_user: 'bg-primary/15 text-primary',
    occasional_user: 'bg-yellow-100 text-yellow-800',
    inactive_user: 'bg-gray-100 text-gray-800'
  };
  return colors[level] || 'bg-gray-100 text-gray-800';
};

/**
 * Get document type label
 */
export const getDocumentTypeLabel = (type) => {
  const labels = {
    invoice: 'Invoice',
    quote: 'Quote',
    receipt: 'Receipt',
    estimate: 'Estimate'
  };
  return labels[type] || 'Unknown';
};

/**
 * Get document type badge color
 */
export const getDocumentTypeColor = (type) => {
  const colors = {
    invoice: 'bg-green-100 text-green-800',
    quote: 'bg-primary/15 text-primary',
    receipt: 'bg-yellow-100 text-yellow-800',
    estimate: 'bg-purple-100 text-purple-800'
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
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
 * Format date
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
 * Format relative time
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
 * Calculate growth percentage
 */
export const calculateGrowth = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * Get activity status
 */
export const getActivityStatus = (lastActivityDate, daysThreshold = 7) => {
  if (!lastActivityDate) return USER_ACTIVITY_STATUS.INACTIVE;
  
  const lastActivity = new Date(lastActivityDate);
  const now = new Date();
  const daysSinceActive = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

  if (daysSinceActive <= daysThreshold) return USER_ACTIVITY_STATUS.ACTIVE;
  if (daysSinceActive <= 30) return USER_ACTIVITY_STATUS.IDLE;
  return USER_ACTIVITY_STATUS.INACTIVE;
};

/**
 * Get activity status color
 */
export const getActivityStatusColor = (status) => {
  const colors = {
    active: 'bg-green-100 text-green-800',
    idle: 'bg-yellow-100 text-yellow-800',
    inactive: 'bg-red-100 text-red-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Get activity status label
 */
export const getActivityStatusLabel = (status) => {
  const labels = {
    active: 'Active',
    idle: 'Idle',
    inactive: 'Inactive'
  };
  return labels[status] || 'Unknown';
};

/**
 * Get chart data for document type distribution
 */
export const getChartDataForDocumentTypes = (distribution) => {
  return [
    {
      name: 'Invoices',
      value: distribution.invoices,
      fill: '#10b981'
    },
    {
      name: 'Quotes',
      value: distribution.quotes,
      fill: '#3b82f6'
    },
    {
      name: 'Receipts',
      value: distribution.receipts,
      fill: '#f59e0b'
    },
    {
      name: 'Estimates',
      value: distribution.estimates,
      fill: '#8b5cf6'
    }
  ].filter(item => item.value > 0);
};

/**
 * Get chart data for engagement levels
 */
export const getChartDataForEngagement = (engagementMetrics) => {
  return [
    {
      name: 'Power Users',
      value: engagementMetrics.powerUsersCount,
      fill: '#8b5cf6'
    },
    {
      name: 'Regular Users',
      value: engagementMetrics.regularUsersCount,
      fill: '#3b82f6'
    },
    {
      name: 'Occasional Users',
      value: engagementMetrics.occasionalUsersCount,
      fill: '#f59e0b'
    }
  ].filter(item => item.value > 0);
};

/**
 * Get chart data for user activity status
 */
export const getChartDataForActivityStatus = (activityStatus) => {
  return [
    {
      name: 'Active',
      value: activityStatus.active,
      fill: '#10b981'
    },
    {
      name: 'Idle',
      value: activityStatus.idle,
      fill: '#f59e0b'
    },
    {
      name: 'Inactive',
      value: activityStatus.inactive,
      fill: '#ef4444'
    }
  ].filter(item => item.value > 0);
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

/**
 * Format large numbers with abbreviations
 */
export const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

/**
 * Export document oversight data to JSON
 */
export const exportOversightDataAsJSON = (data, filename = 'document_oversight.json') => {
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
 * Get top document creators
 */
export const getTopCreators = (usersData, limit = 5) => {
  return usersData.slice(0, limit);
};

/**
 * Get trending document types
 */
export const getTrendingTypes = (monthlyTrends) => {
  if (monthlyTrends.length === 0) return null;
  
  const lastMonth = monthlyTrends[monthlyTrends.length - 1];
  const previousMonth = monthlyTrends[monthlyTrends.length - 2];

  if (!previousMonth) return lastMonth;

  return {
    current: lastMonth,
    previous: previousMonth,
    growth: {
      invoices: calculateGrowth(lastMonth.invoices, previousMonth.invoices),
      quotes: calculateGrowth(lastMonth.quotes, previousMonth.quotes),
      receipts: calculateGrowth(lastMonth.receipts, previousMonth.receipts),
      estimates: calculateGrowth(lastMonth.estimates, previousMonth.estimates)
    }
  };
};

/**
 * Get days until user considered inactive (default 30 days)
 */
export const getDaysUntilInactive = (daysThreshold = 30) => {
  return daysThreshold;
};

/**
 * Get engagement score (0-100)
 */
export const calculateEngagementScore = (documentCount, daysActive) => {
  // Score based on document count (up to 50 points) and recency (up to 50 points)
  const countScore = Math.min(50, (documentCount / 100) * 50);
  const recencyScore = Math.max(0, 50 - (daysActive * (50 / 30)));
  return Math.round(countScore + recencyScore);
};

/**
 * Get engagement score color
 */
export const getEngagementScoreColor = (score) => {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-primary';
  if (score >= 25) return 'text-yellow-600';
  return 'text-red-600';
};
