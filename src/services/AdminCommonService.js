/**
 * Admin Common Service
 * Shared utilities and functions used across all admin pages
 * Eliminates code duplication and provides consistent admin operations
 */

/**
 * Export data as JSON file
 * @param {*} data - Data to export
 * @param {string} filename - Name of exported file
 */
export const exportDataAsJSON = (data, filename) => {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    return { success: true, message: 'Data exported successfully' };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error, message: 'Failed to export data' };
  }
};

/**
 * Export data as CSV file
 * @param {*} data - Data to export (array of objects)
 * @param {string} filename - Name of exported file
 * @param {string[]} columns - Column headers
 */
export const exportDataAsCSV = (data, filename, columns) => {
  try {
    const headers = columns || (data.length > 0 ? Object.keys(data[0]) : []);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(col => {
          const value = row[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    return { success: true, message: 'CSV exported successfully' };
  } catch (error) {
    console.error('CSV export error:', error);
    return { success: false, error, message: 'Failed to export CSV' };
  }
};

/**
 * Pause subscription/account
 * @param {string} id - ID of subscription or account
 * @param {*} service - Service instance with pauseSubscription method
 */
export const pauseSubscription = async (id, service) => {
  try {
    const result = service.pauseSubscription(id);
    return { success: true, data: result, message: 'Subscription paused successfully' };
  } catch (error) {
    console.error('Pause subscription error:', error);
    return { success: false, error, message: 'Failed to pause subscription' };
  }
};

/**
 * Resume subscription/account
 * @param {string} id - ID of subscription or account
 * @param {*} service - Service instance with resumeSubscription method
 */
export const resumeSubscription = async (id, service) => {
  try {
    const result = service.resumeSubscription(id);
    return { success: true, data: result, message: 'Subscription resumed successfully' };
  } catch (error) {
    console.error('Resume subscription error:', error);
    return { success: false, error, message: 'Failed to resume subscription' };
  }
};

/**
 * Cancel subscription/account
 * @param {string} id - ID of subscription or account
 * @param {*} service - Service instance with cancelSubscription method
 */
export const cancelSubscription = async (id, service) => {
  try {
    const result = service.cancelSubscription(id);
    return { success: true, data: result, message: 'Subscription cancelled successfully' };
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return { success: false, error, message: 'Failed to cancel subscription' };
  }
};

/**
 * Suspend user account
 * @param {string} userId - User ID to suspend
 * @param {*} service - Service instance with suspendUser method
 */
export const suspendUserAccount = async (userId, service) => {
  try {
    const result = service.suspendUser(userId);
    return { success: true, data: result, message: 'User suspended successfully' };
  } catch (error) {
    console.error('Suspend user error:', error);
    return { success: false, error, message: 'Failed to suspend user' };
  }
};

/**
 * Reactivate user account
 * @param {string} userId - User ID to reactivate
 * @param {*} service - Service instance with reactivateUser method
 */
export const reactivateUserAccount = async (userId, service) => {
  try {
    const result = service.reactivateUser(userId);
    return { success: true, data: result, message: 'User reactivated successfully' };
  } catch (error) {
    console.error('Reactivate user error:', error);
    return { success: false, error, message: 'Failed to reactivate user' };
  }
};

/**
 * Reset user password
 * @param {string} userId - User ID
 * @param {*} service - Service instance with resetPassword method
 */
export const resetUserPassword = async (userId, service) => {
  try {
    const result = service.resetPassword(userId);
    return { success: true, data: result, message: 'Password reset link sent' };
  } catch (error) {
    console.error('Reset password error:', error);
    return { success: false, error, message: 'Failed to reset password' };
  }
};

/**
 * Search and filter data
 * @param {*} data - Data array to filter
 * @param {string} query - Search query
 * @param {string[]} searchFields - Fields to search in
 */
export const filterData = (data, query, searchFields) => {
  if (!query.trim()) return data;
  const q = query.toLowerCase();
  return data.filter(item =>
    searchFields.some(field => {
      const value = item[field];
      return value && value.toString().toLowerCase().includes(q);
    })
  );
};

/**
 * Sort data by field
 * @param {*} data - Data array to sort
 * @param {string} field - Field to sort by
 * @param {string} direction - 'asc' or 'desc'
 */
export const sortData = (data, field, direction = 'asc') => {
  return [...data].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return direction === 'asc' ? 1 : -1;
    if (bVal === null || bVal === undefined) return direction === 'asc' ? -1 : 1;
    
    if (typeof aVal === 'string') {
      return direction === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });
};

/**
 * Get status badge color (universal)
 * @param {string} status - Status value
 */
export const getStatusBadgeColor = (status) => {
  const statusMap = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-slate-100 text-slate-800',
    suspended: 'bg-red-100 text-red-800',
    paused: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-primary/15 text-primary',
    cancelled: 'bg-slate-200 text-slate-800',
  };
  return statusMap[status?.toLowerCase()] || 'bg-slate-100 text-slate-800';
};

/**
 * Format timestamp to readable date
 * @param {string|number} timestamp - Unix timestamp or date string
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'Invalid date';
  }
};

/**
 * Format timestamp to full datetime
 * @param {string|number} timestamp - Unix timestamp or date string
 */
export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return 'Invalid date';
  }
};

/**
 * Format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'ZAR')
 */
export const formatCurrency = (amount, currency = 'ZAR') => {
  if (amount === null || amount === undefined) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Batch operation handler
 * @param {string[]} ids - IDs to operate on
 * @param {Function} operation - Operation function (id) => Promise
 * @param {Function} onProgress - Progress callback
 */
export const batchOperation = async (ids, operation, onProgress) => {
  const results = { success: [], failed: [] };
  
  for (let i = 0; i < ids.length; i++) {
    try {
      const result = await operation(ids[i]);
      results.success.push({ id: ids[i], result });
      onProgress?.(i + 1, ids.length);
    } catch (error) {
      results.failed.push({ id: ids[i], error });
      onProgress?.(i + 1, ids.length);
    }
  }
  
  return results;
};

/**
 * Generate report summary
 * @param {*} data - Data to summarize
 */
export const generateReportSummary = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      generatedAt: new Date().toISOString()
    };
  }

  const activeCount = data.filter(
    item => item.status === 'active' || item.status === 'enabled'
  ).length;

  return {
    totalCount: data.length,
    activeCount,
    inactiveCount: data.length - activeCount,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Refresh all admin data from storage
 * Clears caches and reloads data across all admin services
 */
export const refreshAllAdminData = () => {
  try {
    // Import AdminDataService dynamically to avoid circular dependencies
    import('./AdminDataService').then(({ default: AdminDataService }) => {
      const result = AdminDataService.refreshData();
      console.log('🔄 Admin data refreshed:', result);
      return result;
    });
    return { success: true };
  } catch (error) {
    console.error('❌ Error refreshing admin data:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Listen for admin data changes
 * Subscribe to data change events across admin pages
 */
export const subscribeToAdminDataChanges = (callback) => {
  const handler = (event) => {
    if (event.detail) {
      callback(event.detail);
    }
  };
  
  window.addEventListener('adminDataChanged', handler);
  
  // Return unsubscribe function
  return () => window.removeEventListener('adminDataChanged', handler);
};

export default {
  exportDataAsJSON,
  exportDataAsCSV,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  suspendUserAccount,
  reactivateUserAccount,
  resetUserPassword,
  filterData,
  sortData,
  getStatusBadgeColor,
  formatDate,
  formatDateTime,
  formatCurrency,
  batchOperation,
  generateReportSummary,
  refreshAllAdminData,
  subscribeToAdminDataChanges
};
