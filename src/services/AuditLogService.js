/**
 * Unified Audit Log Service
 * Centralized audit logging for all platform operations
 * Supports invoice, payment, admin, security, and compliance events
 */

const STORAGE_KEY = 'breakapi_unified_audit_logs';
const MAX_LOGS = 10000; // Keep last 10,000 entries
const RETENTION_DAYS = 365; // Keep logs for 1 year

// Event Type Categories
export const EVENT_TYPES = {
  // Invoice Operations
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_UPDATED: 'INVOICE_UPDATED',
  INVOICE_DELETED: 'INVOICE_DELETED',
  INVOICE_SENT: 'INVOICE_SENT',
  INVOICE_VIEWED: 'INVOICE_VIEWED',
  
  // Payment Operations
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_UPDATED: 'PAYMENT_UPDATED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  
  // Status Changes
  STATUS_CHANGED: 'STATUS_CHANGED',
  
  // User Operations
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  
  // Admin Actions
  ADMIN_ACTION: 'ADMIN_ACTION',
  PLAN_CHANGED: 'PLAN_CHANGED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  
  // Security Events
  SECURITY_ALERT: 'SECURITY_ALERT',
  ACCESS_DENIED: 'ACCESS_DENIED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  
  // Compliance Events
  COMPLIANCE_CHECK: 'COMPLIANCE_CHECK',
  DATA_ACCESS: 'DATA_ACCESS',
  DATA_EXPORT: 'DATA_EXPORT',
  BACKUP_CREATED: 'BACKUP_CREATED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  
  // Client Operations
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_DELETED: 'CLIENT_DELETED'
};

// Severity Levels
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

export const AuditLogService = {
  /**
   * Log an audit event
   */
  logEvent(event) {
    try {
      const log = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type: event.type || 'GENERAL',
        action: event.action || '',
        severity: event.severity || SEVERITY_LEVELS.LOW,
        
        // Entity information
        entityType: event.entityType || null,
        entityId: event.entityId || null,
        entityName: event.entityName || null,
        
        // User information
        userId: event.userId || null,
        userName: event.userName || null,
        performedBy: event.performedBy || event.userName || 'System',
        
        // Additional context
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        location: event.location || null,
        
        // Details
        details: event.details || {},
        metadata: event.metadata || {},
        
        // Client/Account info (for invoice-related events)
        clientName: event.clientName || null,
        accountId: event.accountId || null,
        
        // Financial info
        amount: event.amount || null,
        currency: event.currency || 'ZAR'
      };

      const logs = this.getAllLogs();
      logs.unshift(log); // Add to beginning (newest first)

      // Apply retention policy
      this.applyRetentionPolicy(logs);

      // Save logs
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));

      // Dispatch event for real-time updates
      window.dispatchEvent(new CustomEvent('auditEventLogged', { detail: log }));

      return log;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      return null;
    }
  },

  /**
   * Get all logs from storage
   */
  getAllLogs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  },

  /**
   * Get logs with advanced filtering
   */
  getLogs(filters = {}) {
    let logs = this.getAllLogs();

    // Filter by type
    if (filters.type && filters.type !== 'all') {
      logs = logs.filter(l => l.type === filters.type);
    }

    // Filter by types (array)
    if (filters.types && Array.isArray(filters.types) && filters.types.length > 0) {
      logs = logs.filter(l => filters.types.includes(l.type));
    }

    // Filter by action
    if (filters.action) {
      logs = logs.filter(l => 
        l.action && l.action.toLowerCase().includes(filters.action.toLowerCase())
      );
    }

    // Filter by severity
    if (filters.severity && filters.severity !== 'all') {
      logs = logs.filter(l => l.severity === filters.severity);
    }

    // Filter by user
    if (filters.userId) {
      logs = logs.filter(l => l.userId === filters.userId);
    }

    if (filters.performedBy) {
      logs = logs.filter(l => l.performedBy === filters.performedBy);
    }

    // Filter by entity
    if (filters.entityType) {
      logs = logs.filter(l => l.entityType === filters.entityType);
    }

    if (filters.entityId) {
      logs = logs.filter(l => l.entityId === filters.entityId);
    }

    // Filter by date range
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      logs = logs.filter(l => new Date(l.timestamp).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      logs = logs.filter(l => new Date(l.timestamp).getTime() <= end);
    }

    // Filter by date preset
    if (filters.datePreset) {
      const now = new Date();
      const cutoff = new Date();
      
      switch (filters.datePreset) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          cutoff.setDate(now.getDate() - 1);
          cutoff.setHours(0, 0, 0, 0);
          logs = logs.filter(l => {
            const logDate = new Date(l.timestamp);
            return logDate >= cutoff && logDate < new Date(cutoff.getTime() + 86400000);
          });
          return logs;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setDate(now.getDate() - 30);
          break;
        case '3months':
          cutoff.setDate(now.getDate() - 90);
          break;
        case 'year':
          cutoff.setDate(now.getDate() - 365);
          break;
        default:
          break;
      }
      
      if (filters.datePreset !== 'yesterday') {
        logs = logs.filter(l => new Date(l.timestamp) >= cutoff);
      }
    }

    // Text search across multiple fields
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      logs = logs.filter(l =>
        (l.action && l.action.toLowerCase().includes(searchLower)) ||
        (l.entityName && l.entityName.toLowerCase().includes(searchLower)) ||
        (l.userName && l.userName.toLowerCase().includes(searchLower)) ||
        (l.clientName && l.clientName.toLowerCase().includes(searchLower)) ||
        (l.type && l.type.toLowerCase().includes(searchLower)) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(searchLower))
      );
    }

    // Limit results
    if (filters.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  },

  /**
   * Get statistics about audit logs
   */
  getStatistics(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentLogs = this.getLogs({
      startDate: cutoffDate.toISOString()
    });

    return {
      totalEvents: recentLogs.length,
      byType: this.getBreakdownByType(recentLogs),
      bySeverity: this.getBreakdownBySeverity(recentLogs),
      byUser: this.getBreakdownByUser(recentLogs),
      dailyActivity: this.getDailyActivity(recentLogs, days),
      topUsers: this.getTopUsers(recentLogs, 10),
      recentCritical: recentLogs.filter(l => l.severity === SEVERITY_LEVELS.CRITICAL).slice(0, 10)
    };
  },

  getBreakdownByType(logs) {
    return logs.reduce((acc, log) => {
      acc[log.type] = (acc[log.type] || 0) + 1;
      return acc;
    }, {});
  },

  getBreakdownBySeverity(logs) {
    return logs.reduce((acc, log) => {
      acc[log.severity] = (acc[log.severity] || 0) + 1;
      return acc;
    }, {});
  },

  getBreakdownByUser(logs) {
    return logs.reduce((acc, log) => {
      const user = log.performedBy || 'unknown';
      acc[user] = (acc[user] || 0) + 1;
      return acc;
    }, {});
  },

  getDailyActivity(logs, days) {
    const activity = {};
    const now = new Date();

    // Initialize with zeros
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      activity[dateKey] = 0;
    }

    // Count logs per day
    logs.forEach(log => {
      const dateKey = log.timestamp.split('T')[0];
      if (dateKey in activity) {
        activity[dateKey]++;
      }
    });

    return Object.entries(activity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  getTopUsers(logs, limit = 10) {
    const userCounts = this.getBreakdownByUser(logs);
    return Object.entries(userCounts)
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  /**
   * Apply retention policy (remove old logs)
   */
  applyRetentionPolicy(logs) {
    // Remove logs older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const filtered = logs.filter(log => 
      new Date(log.timestamp) >= cutoffDate
    );

    // Keep only MAX_LOGS entries
    if (filtered.length > MAX_LOGS) {
      return filtered.slice(0, MAX_LOGS);
    }

    return filtered;
  },

  /**
   * Export logs as CSV
   */
  exportAsCSV(filters = {}) {
    const logs = this.getLogs(filters);
    
    const headers = [
      'Timestamp', 'Type', 'Action', 'Severity', 'Entity Type', 'Entity Name',
      'User', 'Client', 'Amount', 'Details'
    ];

    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.type,
      log.action,
      log.severity,
      log.entityType || '',
      log.entityName || '',
      log.userName || log.performedBy || '',
      log.clientName || '',
      log.amount || '',
      JSON.stringify(log.details)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  },

  /**
   * Export logs as JSON
   */
  exportAsJSON(filters = {}) {
    const logs = this.getLogs(filters);
    return JSON.stringify(logs, null, 2);
  },

  /**
   * Download logs as file
   */
  downloadLogs(format = 'csv', filters = {}) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      let content, filename, mimeType;

      if (format === 'csv') {
        content = this.exportAsCSV(filters);
        filename = `audit_logs_${timestamp}.csv`;
        mimeType = 'text/csv';
      } else {
        content = this.exportAsJSON(filters);
        filename = `audit_logs_${timestamp}.json`;
        mimeType = 'application/json';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return { success: true, filename };
    } catch (error) {
      console.error('Failed to download logs:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Clear all logs (use with caution)
   */
  clearLogs() {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('auditLogsCleared'));
  },

  /**
   * Purge logs older than a number of days
   */
  purgeLogs(days) {
    if (!Number.isFinite(days) || days <= 0) {
      return { removed: 0, kept: this.getAllLogs().length };
    }

    const logs = this.getAllLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const retained = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    const removed = logs.length - retained.length;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
    window.dispatchEvent(new CustomEvent('auditLogsPurged', { detail: { removed, kept: retained.length } }));

    return { removed, kept: retained.length };
  },

  /**
   * Migrate old logs from previous systems
   */
  migrateLegacyLogs() {
    try {
      const migrated = [];

      // Migrate from old auditLogger system (audit_logs)
      const oldLogs = localStorage.getItem('audit_logs');
      if (oldLogs) {
        const parsed = JSON.parse(oldLogs);
        migrated.push(...parsed);
      }

      // Migrate from SecurityCompliance system (breakapi_compliance_audit_log)
      const complianceLogs = localStorage.getItem('breakapi_compliance_audit_log');
      if (complianceLogs) {
        const parsed = JSON.parse(complianceLogs);
        migrated.push(...parsed);
      }

      if (migrated.length > 0) {
        // Get existing logs
        const existing = this.getAllLogs();
        
        // Merge and deduplicate by ID
        const combined = [...existing, ...migrated];
        const unique = Array.from(new Map(combined.map(log => [log.id, log])).values());
        
        // Sort by timestamp
        unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Apply retention
        const retained = this.applyRetentionPolicy(unique);
        
        // Save
        localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
        
        console.log(`Migrated ${migrated.length} legacy audit logs`);
        return { success: true, count: migrated.length };
      }

      return { success: true, count: 0 };
    } catch (error) {
      console.error('Failed to migrate legacy logs:', error);
      return { success: false, error: error.message };
    }
  }
};

// Convenience logging functions for common event types

export const logInvoiceCreated = (invoiceId, invoiceNumber, clientName, amount, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.INVOICE_CREATED,
    action: 'Invoice Created',
    entityType: 'Invoice',
    entityId: invoiceId,
    entityName: invoiceNumber,
    clientName,
    amount,
    userId,
    userName,
    severity: SEVERITY_LEVELS.LOW,
    details: { invoiceId, invoiceNumber, clientName, amount }
  });
};

export const logInvoiceUpdated = (invoiceId, invoiceNumber, clientName, changes, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.INVOICE_UPDATED,
    action: 'Invoice Updated',
    entityType: 'Invoice',
    entityId: invoiceId,
    entityName: invoiceNumber,
    clientName,
    userId,
    userName,
    severity: SEVERITY_LEVELS.LOW,
    details: { invoiceId, invoiceNumber, clientName, changedFields: changes }
  });
};

export const logPaymentRecorded = (invoiceId, invoiceNumber, clientName, amount, paymentMethod, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.PAYMENT_RECORDED,
    action: 'Payment Recorded',
    entityType: 'Invoice',
    entityId: invoiceId,
    entityName: invoiceNumber,
    clientName,
    amount,
    userId,
    userName,
    severity: SEVERITY_LEVELS.MEDIUM,
    details: { invoiceId, invoiceNumber, clientName, amount, paymentMethod }
  });
};

export const logStatusChanged = (invoiceId, invoiceNumber, clientName, oldStatus, newStatus, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.STATUS_CHANGED,
    action: 'Status Changed',
    entityType: 'Invoice',
    entityId: invoiceId,
    entityName: invoiceNumber,
    clientName,
    userId,
    userName,
    severity: SEVERITY_LEVELS.LOW,
    details: {
      invoiceId,
      invoiceNumber,
      clientName,
      oldStatus,
      newStatus,
      statusChange: `${oldStatus} → ${newStatus}`
    }
  });
};

export const logAdminAction = (action, entityType, entityId, entityName, description, userId, userName, additionalDetails = {}) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.ADMIN_ACTION,
    action,
    entityType,
    entityId,
    entityName,
    userId,
    userName,
    severity: SEVERITY_LEVELS.MEDIUM,
    details: {
      description,
      ...additionalDetails,
      performedAt: new Date().toISOString()
    }
  });
};

export const logSecurityEvent = (action, severity, details, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.SECURITY_ALERT,
    action,
    severity: severity || SEVERITY_LEVELS.HIGH,
    userId,
    userName,
    details
  });
};

export const logDataAccess = (entityType, entityId, accessType, userId, userName) => {
  return AuditLogService.logEvent({
    type: EVENT_TYPES.DATA_ACCESS,
    action: `Data ${accessType}`,
    entityType,
    entityId,
    userId,
    userName,
    severity: SEVERITY_LEVELS.MEDIUM,
    details: { accessType }
  });
};

// Export for backward compatibility
export const AUDIT_LOG_STORAGE_KEY = STORAGE_KEY;

export default AuditLogService;
