/**
 * Security & Compliance Service
 * Manages role-based access control, audit logs, data access policies, and backup/recovery
 */

const STORAGE_KEYS = {
  ADMIN_ROLES: 'breakapi_admin_roles',
  AUDIT_LOG: 'breakapi_compliance_audit_log',
  DATA_ACCESS_POLICIES: 'breakapi_data_access_policies',
  BACKUP_HISTORY: 'breakapi_backup_history',
  COMPLIANCE_EVENTS: 'breakapi_compliance_events',
  DATA_CLASSIFICATIONS: 'breakapi_data_classifications'
};

// ==================== Role-Based Access Control ====================

export const AdminRolesManager = {
  /**
   * Define admin roles and their permissions
   */
  ADMIN_ROLES: {
    super_admin: {
      name: 'Super Administrator',
      description: 'Full system access - all features, all permissions',
      permissions: [
        'manage_users',
        'manage_roles',
        'view_audit_logs',
        'modify_settings',
        'manage_backups',
        'access_all_data',
        'export_data',
        'delete_data',
        'manage_compliance',
        'manage_security_policies',
        'impersonate_users',
        'view_sensitive_data'
      ],
      risk_level: 'critical'
    },
    admin: {
      name: 'Administrator',
      description: 'Full admin access except user management and compliance',
      permissions: [
        'view_audit_logs',
        'modify_settings',
        'view_backups',
        'access_all_data',
        'export_data',
        'impersonate_users',
        'view_sensitive_data'
      ],
      risk_level: 'high'
    },
    security_officer: {
      name: 'Security Officer',
      description: 'Manages security policies, access control, and compliance',
      permissions: [
        'view_audit_logs',
        'manage_security_policies',
        'manage_data_access_policies',
        'view_sensitive_data',
        'export_compliance_reports',
        'manage_backups',
        'view_user_permissions'
      ],
      risk_level: 'high'
    },
    compliance_officer: {
      name: 'Compliance Officer',
      description: 'Manages compliance, audit trails, and regulatory requirements',
      permissions: [
        'view_audit_logs',
        'export_compliance_reports',
        'view_sensitive_data',
        'view_backups',
        'create_audit_reports',
        'manage_data_retention'
      ],
      risk_level: 'medium'
    },
    audit_officer: {
      name: 'Audit Officer',
      description: 'Read-only access to audit logs and compliance data',
      permissions: [
        'view_audit_logs',
        'view_backups',
        'view_sensitive_data',
        'export_compliance_reports'
      ],
      risk_level: 'low'
    },
    support_admin: {
      name: 'Support Administrator',
      description: 'Limited admin access for support team',
      permissions: [
        'view_audit_logs',
        'impersonate_users',
        'view_logs'
      ],
      risk_level: 'medium'
    }
  },

  /**
   * Get all available admin roles
   */
  getAllRoles() {
    return this.ADMIN_ROLES;
  },

  /**
   * Get role definition
   */
  getRole(roleKey) {
    return this.ADMIN_ROLES[roleKey] || null;
  },

  /**
   * Check if user has permission
   */
  hasPermission(userRole, permission) {
    const role = this.ADMIN_ROLES[userRole];
    if (!role) return false;
    return role.permissions.includes(permission);
  },

  /**
   * Check multiple permissions (AND logic)
   */
  hasAllPermissions(userRole, permissions) {
    return permissions.every(p => this.hasPermission(userRole, p));
  },

  /**
   * Check multiple permissions (OR logic)
   */
  hasAnyPermission(userRole, permissions) {
    return permissions.some(p => this.hasPermission(userRole, p));
  },

  /**
   * Get role permissions
   */
  getPermissions(roleKey) {
    const role = this.ADMIN_ROLES[roleKey];
    return role ? role.permissions : [];
  },

  /**
   * Assign admin role to user
   */
  assignAdminRole(userId, userName, roleKey, assignedBy, reason = '') {
    try {
      const roles = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.ADMIN_ROLES) || '{}'
      );

      if (!this.ADMIN_ROLES[roleKey]) {
        throw new Error(`Invalid role: ${roleKey}`);
      }

      roles[userId] = {
        userId,
        userName,
        role: roleKey,
        assignedAt: new Date().toISOString(),
        assignedBy,
        reason
      };

      localStorage.setItem(STORAGE_KEYS.ADMIN_ROLES, JSON.stringify(roles));

      // Log to audit
      this.logComplianceEvent({
        type: 'role_assignment',
        action: 'assign_admin_role',
        targetUserId: userId,
        targetUserName: userName,
        role: roleKey,
        performedBy: assignedBy,
        reason,
        severity: 'high'
      });

      return roles[userId];
    } catch (err) {
      console.error('Error assigning admin role:', err);
      throw err;
    }
  },

  /**
   * Revoke admin role from user
   */
  revokeAdminRole(userId, revokedBy, reason = '') {
    try {
      const roles = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.ADMIN_ROLES) || '{}'
      );

      const revoked = roles[userId];
      if (!revoked) {
        throw new Error(`User ${userId} is not an admin`);
      }

      delete roles[userId];
      localStorage.setItem(STORAGE_KEYS.ADMIN_ROLES, JSON.stringify(roles));

      // Log to audit
      this.logComplianceEvent({
        type: 'role_revocation',
        action: 'revoke_admin_role',
        targetUserId: userId,
        targetUserName: revoked.userName,
        role: revoked.role,
        performedBy: revokedBy,
        reason,
        severity: 'critical'
      });

      return true;
    } catch (err) {
      console.error('Error revoking admin role:', err);
      throw err;
    }
  },

  /**
   * Get user's admin role
   */
  getUserAdminRole(userId) {
    const roles = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.ADMIN_ROLES) || '{}'
    );
    return roles[userId] || null;
  },

  /**
   * Get all admins
   */
  getAllAdmins() {
    const roles = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.ADMIN_ROLES) || '{}'
    );
    return Object.values(roles);
  }
};

// ==================== Audit Logs ====================

export const AuditLogManager = {
  /**
   * Log compliance-relevant event
   */
  logEvent(event) {
    try {
      const logs = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.AUDIT_LOG) || '[]'
      );

      const auditEntry = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...event
      };

      logs.push(auditEntry);

      // Keep only last 10,000 entries
      if (logs.length > 10000) {
        logs.shift();
      }

      localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(logs));

      return auditEntry;
    } catch (err) {
      console.error('Error logging audit event:', err);
      throw err;
    }
  },

  /**
   * Get audit logs with filtering
   */
  getLogs(filters = {}) {
    try {
      let logs = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.AUDIT_LOG) || '[]'
      );

      // Filter by type
      if (filters.type) {
        logs = logs.filter(l => l.type === filters.type);
      }

      // Filter by action
      if (filters.action) {
        logs = logs.filter(l => l.action === filters.action);
      }

      // Filter by severity
      if (filters.severity) {
        logs = logs.filter(l => l.severity === filters.severity);
      }

      // Filter by user
      if (filters.performedBy) {
        logs = logs.filter(l => l.performedBy === filters.performedBy);
      }

      // Filter by date range
      if (filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate).getTime();
        const end = new Date(filters.endDate).getTime();
        logs = logs.filter(l => {
          const logTime = new Date(l.timestamp).getTime();
          return logTime >= start && logTime <= end;
        });
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return logs;
    } catch (err) {
      console.error('Error getting audit logs:', err);
      return [];
    }
  },

  /**
   * Get audit statistics
   */
  getStatistics(days = 30) {
    const logs = this.getLogs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentLogs = logs.filter(
      l => new Date(l.timestamp) >= cutoffDate
    );

    return {
      totalEvents: recentLogs.length,
      byType: this.getBreakdownByType(recentLogs),
      bySeverity: this.getBreakdownBySeverity(recentLogs),
      byUser: this.getBreakdownByUser(recentLogs),
      dailyActivity: this.getDailyActivity(recentLogs)
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

  getDailyActivity(logs) {
    return logs.reduce((acc, log) => {
      const date = new Date(log.timestamp).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});
  },

  /**
   * Export audit logs as CSV
   */
  exportAsCSV() {
    const logs = this.getLogs();
    if (logs.length === 0) return null;

    const headers = [
      'ID',
      'Timestamp',
      'Type',
      'Action',
      'User',
      'Target User',
      'Severity',
      'Details'
    ];

    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.type,
      log.action,
      log.performedBy,
      log.targetUserName || '-',
      log.severity,
      log.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');

    return csvContent;
  }
};

// ==================== Data Access Control ====================

export const DataAccessManager = {
  /**
   * Define data classifications
   */
  DATA_CLASSIFICATIONS: {
    public: { level: 1, name: 'Public', color: 'green' },
    internal: { level: 2, name: 'Internal', color: 'blue' },
    confidential: { level: 3, name: 'Confidential', color: 'yellow' },
    restricted: { level: 4, name: 'Restricted', color: 'red' }
  },

  /**
   * Create data access policy
   */
  createAccessPolicy(policyName, dataType, dataClassification, allowedRoles, description = '') {
    try {
      const policies = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.DATA_ACCESS_POLICIES) || '[]'
      );

      const policy = {
        id: `policy_${Date.now()}`,
        name: policyName,
        dataType,
        dataClassification,
        allowedRoles,
        description,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      policies.push(policy);
      localStorage.setItem(STORAGE_KEYS.DATA_ACCESS_POLICIES, JSON.stringify(policies));

      return policy;
    } catch (err) {
      console.error('Error creating access policy:', err);
      throw err;
    }
  },

  /**
   * Get access policies
   */
  getPolicies() {
    try {
      return JSON.parse(
        localStorage.getItem(STORAGE_KEYS.DATA_ACCESS_POLICIES) || '[]'
      );
    } catch {
      return [];
    }
  },

  /**
   * Check if user can access data
   */
  canAccessData(userRole, dataType) {
    const policies = this.getPolicies();
    const policy = policies.find(p => p.dataType === dataType && p.status === 'active');

    if (!policy) return true; // No policy = allow by default

    return policy.allowedRoles.includes(userRole);
  },

  /**
   * Get accessible data types for role
   */
  getAccessibleDataTypes(userRole) {
    const policies = this.getPolicies();
    return policies
      .filter(p => p.allowedRoles.includes(userRole) && p.status === 'active')
      .map(p => p.dataType);
  },

  /**
   * Get data access report
   */
  getAccessReport() {
    const policies = this.getPolicies();
    return {
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.status === 'active').length,
      dataTypes: [...new Set(policies.map(p => p.dataType))],
      classifications: [...new Set(policies.map(p => p.dataClassification))],
      policies
    };
  }
};

// ==================== Backup & Recovery ====================

export const BackupRecoveryManager = {
  /**
   * Record backup
   */
  recordBackup(backupName, dataTypes, createdBy) {
    try {
      const backups = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.BACKUP_HISTORY) || '[]'
      );

      const backup = {
        id: `backup_${Date.now()}`,
        name: backupName,
        dataTypes,
        status: 'completed',
        createdAt: new Date().toISOString(),
        createdBy,
        size: 'auto-calculated',
        version: '1.0',
        retentionDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
      };

      backups.push(backup);

      // Keep only last 100 backups
      if (backups.length > 100) {
        backups.shift();
      }

      localStorage.setItem(STORAGE_KEYS.BACKUP_HISTORY, JSON.stringify(backups));

      return backup;
    } catch (err) {
      console.error('Error recording backup:', err);
      throw err;
    }
  },

  /**
   * Get backup history
   */
  getBackups() {
    try {
      const backups = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.BACKUP_HISTORY) || '[]'
      );
      return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch {
      return [];
    }
  },

  /**
   * Get latest backup
   */
  getLatestBackup() {
    const backups = this.getBackups();
    return backups.length > 0 ? backups[0] : null;
  },

  /**
   * Get backup by ID
   */
  getBackupById(backupId) {
    const backups = this.getBackups();
    return backups.find(b => b.id === backupId);
  },

  /**
   * Delete backup
   */
  deleteBackup(backupId, deletedBy) {
    try {
      let backups = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.BACKUP_HISTORY) || '[]'
      );

      const backup = backups.find(b => b.id === backupId);
      if (!backup) throw new Error('Backup not found');

      backups = backups.filter(b => b.id !== backupId);
      localStorage.setItem(STORAGE_KEYS.BACKUP_HISTORY, JSON.stringify(backups));

      AuditLogManager.logEvent({
        type: 'backup_management',
        action: 'delete_backup',
        backupId,
        performedBy: deletedBy,
        severity: 'high'
      });

      return true;
    } catch (err) {
      console.error('Error deleting backup:', err);
      throw err;
    }
  },

  /**
   * Get backup statistics
   */
  getStatistics() {
    const backups = this.getBackups();

    return {
      totalBackups: backups.length,
      completedBackups: backups.filter(b => b.status === 'completed').length,
      latestBackup: backups.length > 0 ? backups[0].createdAt : null,
      backupCoverage: [...new Set(backups.flatMap(b => b.dataTypes))],
      averageInterval: this.calculateAverageInterval(backups)
    };
  },

  calculateAverageInterval(backups) {
    if (backups.length < 2) return null;

    const intervals = [];
    for (let i = 0; i < backups.length - 1; i++) {
      const time1 = new Date(backups[i].createdAt).getTime();
      const time2 = new Date(backups[i + 1].createdAt).getTime();
      intervals.push(time1 - time2);
    }

    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round(avgMs / (1000 * 60 * 60)); // Hours
  }
};

// ==================== Compliance Events ====================

export const ComplianceEventManager = {
  /**
   * Log compliance event
   */
  logComplianceEvent(event) {
    try {
      const events = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.COMPLIANCE_EVENTS) || '[]'
      );

      const compEvent = {
        id: `comp_${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: event.type || 'general',
        title: event.action || 'Unknown Event',
        description: event.description || '',
        severity: event.severity || 'medium',
        performedBy: event.performedBy || 'system',
        targetUser: event.targetUserName || null,
        metadata: {
          type: event.type,
          action: event.action,
          role: event.role,
          reason: event.reason
        }
      };

      events.push(compEvent);

      // Keep only last 5,000 events
      if (events.length > 5000) {
        events.shift();
      }

      localStorage.setItem(STORAGE_KEYS.COMPLIANCE_EVENTS, JSON.stringify(events));

      return compEvent;
    } catch (err) {
      console.error('Error logging compliance event:', err);
      throw err;
    }
  },

  /**
   * Get compliance events
   */
  getEvents(filters = {}) {
    try {
      let events = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.COMPLIANCE_EVENTS) || '[]'
      );

      if (filters.severity) {
        events = events.filter(e => e.severity === filters.severity);
      }

      if (filters.category) {
        events = events.filter(e => e.category === filters.category);
      }

      if (filters.performedBy) {
        events = events.filter(e => e.performedBy === filters.performedBy);
      }

      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return events;
    } catch {
      return [];
    }
  },

  /**
   * Get compliance summary
   */
  getSummary(days = 30) {
    const events = this.getEvents();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentEvents = events.filter(
      e => new Date(e.timestamp) >= cutoffDate
    );

    const bySeverity = {
      critical: recentEvents.filter(e => e.severity === 'critical').length,
      high: recentEvents.filter(e => e.severity === 'high').length,
      medium: recentEvents.filter(e => e.severity === 'medium').length,
      low: recentEvents.filter(e => e.severity === 'low').length
    };

    return {
      totalEvents: recentEvents.length,
      bySeverity,
      criticalIssues: bySeverity.critical,
      complianceScore: this.calculateComplianceScore(bySeverity)
    };
  },

  calculateComplianceScore(bySeverity) {
    const criticalPenalty = bySeverity.critical * 10;
    const highPenalty = bySeverity.high * 3;
    const mediumPenalty = bySeverity.medium * 1;

    const totalPenalty = criticalPenalty + highPenalty + mediumPenalty;
    const score = Math.max(0, 100 - totalPenalty);

    return Math.round(score);
  }
};

// ==================== Export All ====================

export const SecurityComplianceService = {
  AdminRolesManager,
  AuditLogManager,
  DataAccessManager,
  BackupRecoveryManager,
  ComplianceEventManager,

  /**
   * Initialize service with default data
   */
  initialize() {
    // Initialize data classifications
    if (!localStorage.getItem(STORAGE_KEYS.DATA_CLASSIFICATIONS)) {
      localStorage.setItem(
        STORAGE_KEYS.DATA_CLASSIFICATIONS,
        JSON.stringify(DataAccessManager.DATA_CLASSIFICATIONS)
      );
    }

    // Initialize default policies if empty
    if (DataAccessManager.getPolicies().length === 0) {
      this.initializeDefaultPolicies();
    }

    return true;
  },

  /**
   * Initialize default policies
   */
  initializeDefaultPolicies() {
    const defaultPolicies = [
      {
        dataType: 'user_accounts',
        classification: 'restricted',
        roles: ['super_admin', 'admin'],
        description: 'User account information'
      },
      {
        dataType: 'invoices',
        classification: 'confidential',
        roles: ['super_admin', 'admin', 'support_admin'],
        description: 'Invoice data'
      },
      {
        dataType: 'payments',
        classification: 'restricted',
        roles: ['super_admin', 'admin'],
        description: 'Payment information'
      },
      {
        dataType: 'audit_logs',
        classification: 'confidential',
        roles: ['super_admin', 'admin', 'security_officer', 'compliance_officer', 'audit_officer'],
        description: 'System audit logs'
      },
      {
        dataType: 'system_settings',
        classification: 'restricted',
        roles: ['super_admin', 'admin'],
        description: 'Platform settings'
      }
    ];

    defaultPolicies.forEach(p => {
      DataAccessManager.createAccessPolicy(
        p.dataType,
        p.dataType,
        p.classification,
        p.roles,
        p.description
      );
    });
  },

  /**
   * Get comprehensive security report
   */
  getSecurityReport() {
    return {
      timestamp: new Date().toISOString(),
      adminRoles: AdminRolesManager.getAllAdmins(),
      auditStatistics: AuditLogManager.getStatistics(),
      dataAccessReport: DataAccessManager.getAccessReport(),
      backupStatistics: BackupRecoveryManager.getStatistics(),
      complianceSummary: ComplianceEventManager.getSummary()
    };
  }
};

export default SecurityComplianceService;
