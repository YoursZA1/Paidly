import { Crown, Settings, Lock, CheckCircle, Handshake, ClipboardList, Eye } from 'lucide-react';

/**
 * Admin Roles Manager Service
 * Comprehensive role-based access control with detailed permission management
 */

// ==================== Core Role Definitions ====================

export const ROLE_DEFINITIONS = {
  // =================================
  // TIER 1: SUPER ADMINISTRATOR
  // =================================
  super_admin: {
    id: 'super_admin',
    name: 'Super Administrator',
    tier: 1,
    riskLevel: 'CRITICAL',
    description: 'Full system access - manages entire platform, users, security, compliance',
    color: '#DC2626',
    icon: Crown,
    
    // Core System Permissions
    systemPermissions: {
      // System Management
      manage_system_settings: true,
      manage_integrations: true,
      manage_apis: true,
      system_maintenance: true,
      
      // User Management
      manage_users_all: true,
      manage_admin_roles: true,
      create_users: true,
      delete_users: true,
      suspend_users: true,
      manage_user_plans: true,
      
      // Security
      manage_security_policies: true,
      manage_data_access_policies: true,
      manage_encryption: true,
      manage_2fa_enforcement: true,
      view_sensitive_data: true,
      
      // Auditing & Compliance
      view_audit_logs: true,
      export_audit_logs: true,
      manage_audit_retention: true,
      create_compliance_reports: true,
      manage_compliance_settings: true,
      
      // Data Management
      backup_management: true,
      restore_data: true,
      export_all_data: true,
      delete_data: true,
      manage_data_retention: true,
      
      // Admin Features
      impersonate_users: true,
      view_error_logs: true,
      manage_notifications: true,
      access_admin_panel: true
    },
    
    // Feature Access
    features: {
      invoicing: true,
      quotes: true,
      payments: true,
      clients: true,
      reports: true,
      recurring_invoices: true,
      multi_currency: true,
      custom_branding: true,
      api_access: true,
      webhooks: true,
      bulk_operations: true,
      custom_fields: true,
      workflows: true,
      integrations: true,
      advanced_reporting: true
    },
    
    // Data Access
    dataAccess: {
      user_accounts: 'full',      // full, read-only, restricted
      invoices: 'full',
      payments: 'full',
      clients: 'full',
      reports: 'full',
      settings: 'full',
      audit_logs: 'full',
      backups: 'full',
      api_keys: 'full'
    },
    
    // Restrictions (none for super admin)
    restrictions: []
  },

  // =================================
  // TIER 2: ADMINISTRATOR
  // =================================
  admin: {
    id: 'admin',
    name: 'Administrator',
    tier: 2,
    riskLevel: 'HIGH',
    description: 'Full administrative access with most management capabilities',
    color: '#EA580C',
    icon: Settings,
    
    systemPermissions: {
      // System Management (limited)
      manage_system_settings: false,
      manage_integrations: true,
      manage_apis: false,
      system_maintenance: false,
      
      // User Management
      manage_users_all: true,
      manage_admin_roles: false,  // Cannot manage other admins
      create_users: true,
      delete_users: true,
      suspend_users: true,
      manage_user_plans: true,
      
      // Security (limited)
      manage_security_policies: false,
      manage_data_access_policies: true,
      manage_encryption: false,
      manage_2fa_enforcement: false,
      view_sensitive_data: true,
      
      // Auditing
      view_audit_logs: true,
      export_audit_logs: true,
      manage_audit_retention: false,
      create_compliance_reports: true,
      manage_compliance_settings: false,
      
      // Data Management
      backup_management: true,
      restore_data: false,
      export_all_data: true,
      delete_data: false,
      manage_data_retention: false,
      
      // Admin Features
      impersonate_users: true,
      view_error_logs: true,
      manage_notifications: true,
      access_admin_panel: true
    },
    
    features: {
      invoicing: true,
      quotes: true,
      payments: true,
      clients: true,
      reports: true,
      recurring_invoices: true,
      multi_currency: true,
      custom_branding: true,
      api_access: true,
      webhooks: true,
      bulk_operations: true,
      custom_fields: true,
      workflows: true,
      integrations: true,
      advanced_reporting: true
    },
    
    dataAccess: {
      user_accounts: 'read-only',
      invoices: 'full',
      payments: 'full',
      clients: 'full',
      reports: 'full',
      settings: 'read-only',
      audit_logs: 'read-only',
      backups: 'read-only',
      api_keys: 'read-only'
    },
    
    restrictions: [
      'Cannot manage other admin roles',
      'Cannot access system configuration',
      'Cannot restore from backups',
      'Cannot delete user data'
    ]
  },

  // =================================
  // TIER 3: SECURITY OFFICER
  // =================================
  security_officer: {
    id: 'security_officer',
    name: 'Security Officer',
    tier: 3,
    riskLevel: 'HIGH',
    description: 'Manages security policies, access control, and compliance',
    color: '#F59E0B',
    icon: Lock,
    
    systemPermissions: {
      manage_system_settings: false,
      manage_integrations: false,
      manage_apis: false,
      system_maintenance: false,
      manage_users_all: false,
      manage_admin_roles: false,
      create_users: false,
      delete_users: false,
      suspend_users: false,
      manage_user_plans: false,
      manage_security_policies: true,
      manage_data_access_policies: true,
      manage_encryption: true,
      manage_2fa_enforcement: true,
      view_sensitive_data: true,
      view_audit_logs: true,
      export_audit_logs: true,
      manage_audit_retention: true,
      create_compliance_reports: true,
      manage_compliance_settings: true,
      backup_management: false,
      restore_data: false,
      export_all_data: false,
      delete_data: false,
      manage_data_retention: true,
      impersonate_users: false,
      view_error_logs: true,
      manage_notifications: false,
      access_admin_panel: true
    },
    
    features: {
      invoicing: false,
      quotes: false,
      payments: false,
      clients: false,
      reports: true,
      recurring_invoices: false,
      multi_currency: false,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      bulk_operations: false,
      custom_fields: false,
      workflows: false,
      integrations: false,
      advanced_reporting: true
    },
    
    dataAccess: {
      user_accounts: 'read-only',
      invoices: 'read-only',
      payments: 'restricted',
      clients: 'read-only',
      reports: 'read-only',
      settings: 'restricted',
      audit_logs: 'full',
      backups: 'read-only',
      api_keys: 'restricted'
    },
    
    restrictions: [
      'Cannot manage users',
      'Cannot modify business data',
      'Cannot backup/restore data',
      'Cannot impersonate users'
    ]
  },

  // =================================
  // TIER 4: COMPLIANCE OFFICER
  // =================================
  compliance_officer: {
    id: 'compliance_officer',
    name: 'Compliance Officer',
    tier: 4,
    riskLevel: 'MEDIUM',
    description: 'Manages compliance, audit trails, and regulatory requirements',
    color: '#10B981',
    icon: CheckCircle,
    
    systemPermissions: {
      manage_system_settings: false,
      manage_integrations: false,
      manage_apis: false,
      system_maintenance: false,
      manage_users_all: false,
      manage_admin_roles: false,
      create_users: false,
      delete_users: false,
      suspend_users: false,
      manage_user_plans: false,
      manage_security_policies: false,
      manage_data_access_policies: false,
      manage_encryption: false,
      manage_2fa_enforcement: false,
      view_sensitive_data: true,
      view_audit_logs: true,
      export_audit_logs: true,
      manage_audit_retention: false,
      create_compliance_reports: true,
      manage_compliance_settings: false,
      backup_management: false,
      restore_data: false,
      export_all_data: false,
      delete_data: false,
      manage_data_retention: false,
      impersonate_users: false,
      view_error_logs: false,
      manage_notifications: false,
      access_admin_panel: false
    },
    
    features: {
      invoicing: false,
      quotes: false,
      payments: false,
      clients: false,
      reports: true,
      recurring_invoices: false,
      multi_currency: false,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      bulk_operations: false,
      custom_fields: false,
      workflows: false,
      integrations: false,
      advanced_reporting: true
    },
    
    dataAccess: {
      user_accounts: 'restricted',
      invoices: 'read-only',
      payments: 'restricted',
      clients: 'read-only',
      reports: 'read-only',
      settings: 'restricted',
      audit_logs: 'full',
      backups: 'read-only',
      api_keys: 'restricted'
    },
    
    restrictions: [
      'Cannot manage users',
      'Cannot modify data',
      'Cannot manage security policies',
      'Cannot backup/restore'
    ]
  },

  // =================================
  // TIER 5: SUPPORT ADMIN
  // =================================
  support_admin: {
    id: 'support_admin',
    name: 'Support Administrator',
    tier: 5,
    riskLevel: 'MEDIUM',
    description: 'Limited admin access for support team - impersonation and user assistance',
    color: '#3B82F6',
    icon: Handshake,
    
    systemPermissions: {
      manage_system_settings: false,
      manage_integrations: false,
      manage_apis: false,
      system_maintenance: false,
      manage_users_all: false,
      manage_admin_roles: false,
      create_users: true,
      delete_users: false,
      suspend_users: false,
      manage_user_plans: false,
      manage_security_policies: false,
      manage_data_access_policies: false,
      manage_encryption: false,
      manage_2fa_enforcement: false,
      view_sensitive_data: false,
      view_audit_logs: true,
      export_audit_logs: false,
      manage_audit_retention: false,
      create_compliance_reports: false,
      manage_compliance_settings: false,
      backup_management: false,
      restore_data: false,
      export_all_data: false,
      delete_data: false,
      manage_data_retention: false,
      impersonate_users: true,
      view_error_logs: true,
      manage_notifications: false,
      access_admin_panel: true
    },
    
    features: {
      invoicing: true,
      quotes: true,
      payments: false,
      clients: true,
      reports: true,
      recurring_invoices: false,
      multi_currency: false,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      bulk_operations: false,
      custom_fields: false,
      workflows: false,
      integrations: false,
      advanced_reporting: false
    },
    
    dataAccess: {
      user_accounts: 'restricted',
      invoices: 'full',
      payments: 'restricted',
      clients: 'full',
      reports: 'read-only',
      settings: 'restricted',
      audit_logs: 'read-only',
      backups: 'restricted',
      api_keys: 'restricted'
    },
    
    restrictions: [
      'Cannot manage system settings',
      'Cannot access payments data',
      'Cannot delete users',
      'Cannot manage security'
    ]
  },

  // =================================
  // TIER 6: AUDIT OFFICER
  // =================================
  audit_officer: {
    id: 'audit_officer',
    name: 'Audit Officer',
    tier: 6,
    riskLevel: 'LOW',
    description: 'Read-only access to audit logs and compliance data',
    color: '#8B5CF6',
    icon: ClipboardList,
    
    systemPermissions: {
      manage_system_settings: false,
      manage_integrations: false,
      manage_apis: false,
      system_maintenance: false,
      manage_users_all: false,
      manage_admin_roles: false,
      create_users: false,
      delete_users: false,
      suspend_users: false,
      manage_user_plans: false,
      manage_security_policies: false,
      manage_data_access_policies: false,
      manage_encryption: false,
      manage_2fa_enforcement: false,
      view_sensitive_data: false,
      view_audit_logs: true,
      export_audit_logs: true,
      manage_audit_retention: false,
      create_compliance_reports: true,
      manage_compliance_settings: false,
      backup_management: false,
      restore_data: false,
      export_all_data: false,
      delete_data: false,
      manage_data_retention: false,
      impersonate_users: false,
      view_error_logs: false,
      manage_notifications: false,
      access_admin_panel: false
    },
    
    features: {
      invoicing: false,
      quotes: false,
      payments: false,
      clients: false,
      reports: true,
      recurring_invoices: false,
      multi_currency: false,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      bulk_operations: false,
      custom_fields: false,
      workflows: false,
      integrations: false,
      advanced_reporting: true
    },
    
    dataAccess: {
      user_accounts: 'restricted',
      invoices: 'read-only',
      payments: 'restricted',
      clients: 'restricted',
      reports: 'read-only',
      settings: 'restricted',
      audit_logs: 'full',
      backups: 'read-only',
      api_keys: 'restricted'
    },
    
    restrictions: [
      'Read-only access only',
      'Cannot modify any data',
      'Cannot manage users',
      'Cannot impersonate users'
    ]
  },

  // =================================
  // TIER 7: READ-ONLY VIEWER
  // =================================
  read_only: {
    id: 'read_only',
    name: 'Read-Only Viewer',
    tier: 7,
    riskLevel: 'LOW',
    description: 'Minimal read-only access for viewing reports and data',
    color: '#6B7280',
    icon: Eye,
    
    systemPermissions: {
      manage_system_settings: false,
      manage_integrations: false,
      manage_apis: false,
      system_maintenance: false,
      manage_users_all: false,
      manage_admin_roles: false,
      create_users: false,
      delete_users: false,
      suspend_users: false,
      manage_user_plans: false,
      manage_security_policies: false,
      manage_data_access_policies: false,
      manage_encryption: false,
      manage_2fa_enforcement: false,
      view_sensitive_data: false,
      view_audit_logs: false,
      export_audit_logs: false,
      manage_audit_retention: false,
      create_compliance_reports: false,
      manage_compliance_settings: false,
      backup_management: false,
      restore_data: false,
      export_all_data: false,
      delete_data: false,
      manage_data_retention: false,
      impersonate_users: false,
      view_error_logs: false,
      manage_notifications: false,
      access_admin_panel: false
    },
    
    features: {
      invoicing: true,
      quotes: true,
      payments: true,
      clients: true,
      reports: true,
      recurring_invoices: true,
      multi_currency: true,
      custom_branding: false,
      api_access: false,
      webhooks: false,
      bulk_operations: false,
      custom_fields: false,
      workflows: false,
      integrations: false,
      advanced_reporting: false
    },
    
    dataAccess: {
      user_accounts: 'restricted',
      invoices: 'read-only',
      payments: 'restricted',
      clients: 'read-only',
      reports: 'read-only',
      settings: 'restricted',
      audit_logs: 'restricted',
      backups: 'restricted',
      api_keys: 'restricted'
    },
    
    restrictions: [
      'Read-only access only',
      'Cannot modify any data',
      'Cannot access admin panel',
      'Cannot view sensitive data'
    ]
  }
};

// ==================== Admin Roles Manager ====================

export const AdminRolesManager = {
  /**
   * Get all role definitions
   */
  getAllRoles() {
    return Object.values(ROLE_DEFINITIONS);
  },

  /**
   * Get role by ID
   */
  getRole(roleId) {
    return ROLE_DEFINITIONS[roleId] || null;
  },

  /**
   * Get all role IDs
   */
  getAllRoleIds() {
    return Object.keys(ROLE_DEFINITIONS);
  },

  /**
   * Check if user has permission
   */
  hasPermission(roleId, permission) {
    const role = this.getRole(roleId);
    if (!role) return false;
    return role.systemPermissions[permission] === true;
  },

  /**
   * Check multiple permissions (AND logic)
   */
  hasAllPermissions(roleId, permissions) {
    return permissions.every(p => this.hasPermission(roleId, p));
  },

  /**
   * Check multiple permissions (OR logic)
   */
  hasAnyPermission(roleId, permissions) {
    return permissions.some(p => this.hasPermission(roleId, p));
  },

  /**
   * Check if role has feature access
   */
  hasFeatureAccess(roleId, feature) {
    const role = this.getRole(roleId);
    if (!role) return false;
    return role.features[feature] === true;
  },

  /**
   * Get role data access level
   */
  getDataAccess(roleId, dataType) {
    const role = this.getRole(roleId);
    if (!role) return 'restricted';
    return role.dataAccess[dataType] || 'restricted';
  },

  /**
   * Get all permissions for role
   */
  getPermissions(roleId) {
    const role = this.getRole(roleId);
    if (!role) return [];
    return Object.entries(role.systemPermissions)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  },

  /**
   * Get all features for role
   */
  getFeatures(roleId) {
    const role = this.getRole(roleId);
    if (!role) return [];
    return Object.entries(role.features)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  },

  /**
   * Get role permissions count
   */
  getPermissionCount(roleId) {
    return this.getPermissions(roleId).length;
  },

  /**
   * Get role feature count
   */
  getFeatureCount(roleId) {
    return this.getFeatures(roleId).length;
  },

  /**
   * Get roles by tier
   */
  getRolesByTier(tier) {
    return this.getAllRoles().filter(r => r.tier === tier);
  },

  /**
   * Get roles with specific permission
   */
  getRolesWithPermission(permission) {
    return this.getAllRoles()
      .filter(r => r.systemPermissions[permission] === true)
      .map(r => r.id);
  },

  /**
   * Compare role permissions
   */
  compareRoles(roleId1, roleId2) {
    const role1 = this.getRole(roleId1);
    const role2 = this.getRole(roleId2);

    if (!role1 || !role2) return null;

    const perms1 = new Set(this.getPermissions(roleId1));
    const perms2 = new Set(this.getPermissions(roleId2));

    return {
      role1: role1.name,
      role2: role2.name,
      onlyIn1: Array.from(perms1).filter(p => !perms2.has(p)),
      onlyIn2: Array.from(perms2).filter(p => !perms1.has(p)),
      common: Array.from(perms1).filter(p => perms2.has(p))
    };
  },

  /**
   * Get hierarchy of roles
   */
  getRoleHierarchy() {
    return this.getAllRoles()
      .sort((a, b) => a.tier - b.tier)
      .map(r => ({
        id: r.id,
        name: r.name,
        tier: r.tier,
        riskLevel: r.riskLevel,
        icon: r.icon,
        description: r.description
      }));
  },

  /**
   * Export role definitions as JSON
   */
  exportRoles() {
    return JSON.stringify(ROLE_DEFINITIONS, null, 2);
  },

  /**
   * Get role summary
   */
  getRoleSummary(roleId) {
    const role = this.getRole(roleId);
    if (!role) return null;

    return {
      id: role.id,
      name: role.name,
      tier: role.tier,
      riskLevel: role.riskLevel,
      description: role.description,
      icon: role.icon,
      color: role.color,
      permissionCount: this.getPermissionCount(roleId),
      featureCount: this.getFeatureCount(roleId),
      dataAccessTypes: Object.keys(role.dataAccess),
      restrictions: role.restrictions.length,
      restrictionList: role.restrictions
    };
  },

  /**
   * Get all role summaries
   */
  getAllRoleSummaries() {
    return this.getAllRoles().map(r => this.getRoleSummary(r.id));
  }
};

export default AdminRolesManager;
