/**
 * AdminDataService
 * Unified data service for all admin operations.
 * Centralizes data access, caching, and synchronization across admin pages.
 * Canonical source for users and reporting is Supabase: data is loaded via
 * sync (GET /api/admin/sync-users or sync-data) into localStorage; this
 * service prefers Supabase-sourced keys (breakapi_supabase_*) when present.
 * See docs/SUPABASE_INTEGRATION_CHECKLIST.md § Database Operations.
 */

import AuditLogService, { EVENT_TYPES, SEVERITY_LEVELS } from './AuditLogService';

// Storage keys
const STORAGE_KEYS = {
  USERS: 'breakapi_users',
  LOGIN_HISTORY: 'breakapi_login_history',
  BILLING_HISTORY: 'breakapi_billing_history',
  PLAN_CHANGE_HISTORY: 'plan_change_history',
  USER_MANAGEMENT: 'breakapi_user_management',
  AUDIT_LOGS: 'breakapi_unified_audit_logs'
};

const SUPABASE_KEYS = {
  USERS: 'breakapi_supabase_users',
  ORGANIZATIONS: 'breakapi_supabase_organizations',
  MEMBERSHIPS: 'breakapi_supabase_memberships',
  CLIENTS: 'breakapi_supabase_clients',
  SERVICES: 'breakapi_supabase_services',
  INVOICES: 'breakapi_supabase_invoices',
  QUOTES: 'breakapi_supabase_quotes',
  PAYMENTS: 'breakapi_supabase_payments',
  ASSETS: 'breakapi_supabase_assets',
  AFFILIATES: 'breakapi_supabase_affiliates',
  AFFILIATE_APPLICATIONS: 'breakapi_supabase_affiliate_applications',
  REFERRALS: 'breakapi_supabase_referrals',
  COMMISSIONS: 'breakapi_supabase_commissions',
  AFFILIATE_CLICKS: 'breakapi_supabase_affiliate_clicks'
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// In-memory cache
let dataCache = {
  users: { data: null, timestamp: 0 },
  loginHistory: { data: null, timestamp: 0 },
  billingHistory: { data: null, timestamp: 0 },
  planChangeHistory: { data: null, timestamp: 0 },
  statistics: { data: null, timestamp: 0 }
};

class AdminDataService {
  /**
   * Clear all caches - use when data is modified
   */
  static clearCache() {
    dataCache = {
      users: { data: null, timestamp: 0 },
      loginHistory: { data: null, timestamp: 0 },
      billingHistory: { data: null, timestamp: 0 },
      planChangeHistory: { data: null, timestamp: 0 },
      statistics: { data: null, timestamp: 0 }
    };
    console.log('🔄 AdminDataService: Cache cleared');
  }

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(cacheEntry) {
    if (!cacheEntry.data) return false;
    const age = Date.now() - cacheEntry.timestamp;
    return age < CACHE_DURATION;
  }

  /**
   * Broadcast data change event
   */
  static broadcastDataChange(eventType, data) {
    const event = new CustomEvent('adminDataChanged', {
      detail: { eventType, data, timestamp: new Date().toISOString() }
    });
    window.dispatchEvent(event);
    console.log(`📡 AdminDataService: Broadcast ${eventType}`, data);
  }

  static getSupabaseData(key) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get all users with caching
   */
  static getAllUsers() {
    if (this.isCacheValid(dataCache.users)) {
      console.log('✅ AdminDataService: Returning cached users');
      return dataCache.users.data;
    }

    try {
      const supabaseUsers = this.getSupabaseData(SUPABASE_KEYS.USERS);
      const stored = localStorage.getItem(STORAGE_KEYS.USERS);
      const users = supabaseUsers.length ? supabaseUsers : (stored ? JSON.parse(stored) : []);
      
      dataCache.users = {
        data: users,
        timestamp: Date.now()
      };
      
      console.log(`📊 AdminDataService: Loaded ${users.length} users from storage`);
      return users;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading users:', error);
      return [];
    }
  }

  /**
   * Get all affiliates from synced data
   */
  static getAllAffiliates() {
    try {
      const affiliates = this.getSupabaseData(SUPABASE_KEYS.AFFILIATES);
      console.log(`📊 AdminDataService: Loaded ${affiliates.length} affiliates from storage`);
      return affiliates;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading affiliates:', error);
      return [];
    }
  }

  static getAllAffiliateApplications() {
    try {
      const applications = this.getSupabaseData(SUPABASE_KEYS.AFFILIATE_APPLICATIONS);
      console.log(`📊 AdminDataService: Loaded ${applications.length} affiliate applications from storage`);
      return applications;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading affiliate applications:', error);
      return [];
    }
  }

  static getAllReferrals() {
    try {
      const referrals = this.getSupabaseData(SUPABASE_KEYS.REFERRALS);
      console.log(`📊 AdminDataService: Loaded ${referrals.length} referrals from storage`);
      return referrals;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading referrals:', error);
      return [];
    }
  }

  static getAllCommissions() {
    try {
      const commissions = this.getSupabaseData(SUPABASE_KEYS.COMMISSIONS);
      console.log(`📊 AdminDataService: Loaded ${commissions.length} commissions from storage`);
      return commissions;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading commissions:', error);
      return [];
    }
  }

  static getAllAffiliateClicks() {
    try {
      const clicks = this.getSupabaseData(SUPABASE_KEYS.AFFILIATE_CLICKS);
      console.log(`📊 AdminDataService: Loaded ${clicks.length} affiliate clicks from storage`);
      return clicks;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading affiliate clicks:', error);
      return [];
    }
  }

  /**
   * Get user by ID
   */
  static getUserById(userId) {
    const users = this.getAllUsers();
    return users.find(u => u.id === userId);
  }

  /**
   * Get user by email
   */
  static getUserByEmail(email) {
    const users = this.getAllUsers();
    return users.find(u => u.email === email);
  }

  /**
   * Update user data
   */
  static updateUser(userId, updates) {
    const users = this.getAllUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      console.error('❌ AdminDataService: User not found:', userId);
      return { success: false, error: 'User not found' };
    }

    const oldUser = { ...users[userIndex] };
    users[userIndex] = {
      ...users[userIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };

    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      this.clearCache();
      this.broadcastDataChange('userUpdated', { userId, updates });
      
      // Log audit event
      AuditLogService.logEvent({
        type: EVENT_TYPES.USER_UPDATED,
        action: 'Admin updated user',
        severity: SEVERITY_LEVELS.MEDIUM,
        userId: userId,
        performedBy: 'admin',
        entityType: 'User',
        entityId: userId,
        details: { oldUser, newUser: users[userIndex], changes: updates }
      });

      console.log('✅ AdminDataService: User updated successfully:', userId);
      return { success: true, user: users[userIndex] };
    } catch (error) {
      console.error('❌ AdminDataService: Error updating user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get login history with caching
   */
  static getLoginHistory(userId = null) {
    if (this.isCacheValid(dataCache.loginHistory)) {
      const history = dataCache.loginHistory.data;
      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      return history;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.LOGIN_HISTORY);
      const history = stored ? JSON.parse(stored) : [];
      
      dataCache.loginHistory = {
        data: history,
        timestamp: Date.now()
      };

      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      
      console.log(`📊 AdminDataService: Loaded ${history.length} login records`);
      return history;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading login history:', error);
      return [];
    }
  }

  /**
   * Record login activity
   */
  static recordLoginActivity(userId, userEmail, metadata = {}) {
    const loginHistory = this.getLoginHistory();
    
    const entry = {
      id: `login_${Date.now()}`,
      userId,
      userEmail,
      timestamp: new Date().toISOString(),
      ipAddress: metadata.ipAddress || 'Unknown',
      browser: metadata.browser || 'Unknown',
      location: metadata.location || 'Unknown',
      success: metadata.success !== false
    };

    loginHistory.push(entry);

    try {
      localStorage.setItem(STORAGE_KEYS.LOGIN_HISTORY, JSON.stringify(loginHistory));
      this.clearCache();
      
      // Log audit event
      AuditLogService.logEvent({
        type: EVENT_TYPES.USER_LOGIN,
        action: `User ${entry.success ? 'logged in' : 'login failed'}`,
        severity: entry.success ? SEVERITY_LEVELS.LOW : SEVERITY_LEVELS.MEDIUM,
        userId: userId,
        performedBy: userEmail,
        details: metadata
      });

      console.log('✅ AdminDataService: Login activity recorded:', userId);
      return { success: true, entry };
    } catch (error) {
      console.error('❌ AdminDataService: Error recording login:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get billing history with caching
   */
  static getBillingHistory(userId = null) {
    if (this.isCacheValid(dataCache.billingHistory)) {
      const history = dataCache.billingHistory.data;
      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      return history;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.BILLING_HISTORY);
      const history = stored ? JSON.parse(stored) : [];
      
      dataCache.billingHistory = {
        data: history,
        timestamp: Date.now()
      };

      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      
      console.log(`📊 AdminDataService: Loaded ${history.length} billing records`);
      return history;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading billing history:', error);
      return [];
    }
  }

  /**
   * Get plan change history with caching
   */
  static getPlanChangeHistory(userId = null) {
    if (this.isCacheValid(dataCache.planChangeHistory)) {
      const history = dataCache.planChangeHistory.data;
      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      return history;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PLAN_CHANGE_HISTORY);
      const history = stored ? JSON.parse(stored) : [];
      
      dataCache.planChangeHistory = {
        data: history,
        timestamp: Date.now()
      };

      if (userId) {
        return history.filter(entry => entry.userId === userId);
      }
      
      console.log(`📊 AdminDataService: Loaded ${history.length} plan change records`);
      return history;
    } catch (error) {
      console.error('❌ AdminDataService: Error loading plan change history:', error);
      return [];
    }
  }

  /**
   * Record plan change
   */
  static recordPlanChange(userId, oldPlan, newPlan, reason, performedBy = 'admin') {
    const history = this.getPlanChangeHistory();
    
    const entry = {
      id: `plan_change_${Date.now()}`,
      userId,
      oldPlan,
      newPlan,
      reason,
      performedBy,
      timestamp: new Date().toISOString()
    };

    history.push(entry);

    try {
      localStorage.setItem(STORAGE_KEYS.PLAN_CHANGE_HISTORY, JSON.stringify(history));
      this.clearCache();
      
      // Log audit event
      AuditLogService.logEvent({
        type: EVENT_TYPES.PLAN_CHANGED,
        action: `Plan changed from ${oldPlan} to ${newPlan}`,
        severity: SEVERITY_LEVELS.MEDIUM,
        userId: userId,
        performedBy: performedBy,
        entityType: 'Subscription',
        details: { oldPlan, newPlan, reason }
      });

      console.log('✅ AdminDataService: Plan change recorded:', userId);
      return { success: true, entry };
    } catch (error) {
      console.error('❌ AdminDataService: Error recording plan change:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get platform-wide statistics with caching
   */
  static getPlatformStatistics() {
    if (this.isCacheValid(dataCache.statistics)) {
      console.log('✅ AdminDataService: Returning cached statistics');
      return dataCache.statistics.data;
    }

    const users = this.getAllUsers();
    const loginHistory = this.getLoginHistory();
    const billingHistory = this.getBillingHistory();
    const supabaseInvoices = this.getSupabaseData(SUPABASE_KEYS.INVOICES);
    const supabaseClients = this.getSupabaseData(SUPABASE_KEYS.CLIENTS);
    const supabasePayments = this.getSupabaseData(SUPABASE_KEYS.PAYMENTS);

    const totalRevenue = supabaseInvoices.length
      ? supabaseInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount || inv.total || 0)), 0)
      : billingHistory
        .filter(b => b.status === 'succeeded')
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    const paidRevenue = supabasePayments.length
      ? supabasePayments
        .filter(p => p.status === 'paid' || p.status === 'succeeded')
        .reduce((sum, p) => sum + (Number(p.amount || 0)), 0)
      : billingHistory
        .filter(b => b.status === 'succeeded')
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'active' || !u.status).length,
      suspendedUsers: users.filter(u => u.status === 'suspended').length,
      trialUsers: users.filter(u => {
        const trialEndsAt = u.trial_ends_at ? new Date(u.trial_ends_at) : null;
        return trialEndsAt && trialEndsAt > new Date();
      }).length,

      planDistribution: {
        free: users.filter(u => (u.plan || 'free') === 'free').length,
        starter: users.filter(u => u.plan === 'starter').length,
        professional: users.filter(u => u.plan === 'professional').length,
        enterprise: users.filter(u => u.plan === 'enterprise').length
      },

      recentLogins: loginHistory
        .filter(l => {
          const loginDate = new Date(l.timestamp);
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return loginDate > dayAgo;
        }).length,

      totalRevenue,
      totalClients: supabaseClients.length || 0,
      totalInvoices: supabaseInvoices.length || 0,
      paidRevenue,
      outstandingRevenue: totalRevenue - paidRevenue,
      lastUpdated: new Date().toISOString()
    };

    dataCache.statistics = {
      data: stats,
      timestamp: Date.now()
    };

    console.log('📊 AdminDataService: Calculated platform statistics:', stats);
    return stats;
  }

  /**
   * Suspend user account
   */
  static suspendUser(userId, reason, performedBy = 'admin') {
    const result = this.updateUser(userId, {
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspension_reason: reason
    });

    if (result.success) {
      AuditLogService.logEvent({
        type: EVENT_TYPES.USER_SUSPENDED,
        action: 'User account suspended',
        severity: SEVERITY_LEVELS.HIGH,
        userId: userId,
        performedBy: performedBy,
        entityType: 'User',
        entityId: userId,
        details: { reason }
      });
    }

    return result;
  }

  /**
   * Reactivate user account
   */
  static reactivateUser(userId, performedBy = 'admin') {
    const result = this.updateUser(userId, {
      status: 'active',
      suspended_at: null,
      suspension_reason: null,
      reactivated_at: new Date().toISOString()
    });

    if (result.success) {
      AuditLogService.logEvent({
        type: EVENT_TYPES.USER_ACTIVATED,
        action: 'User account reactivated',
        severity: SEVERITY_LEVELS.MEDIUM,
        userId: userId,
        performedBy: performedBy,
        entityType: 'User',
        entityId: userId
      });
    }

    return result;
  }

  /**
   * Change user plan
   */
  static changeUserPlan(userId, newPlan, reason, performedBy = 'admin') {
    const user = this.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const oldPlan = user.plan || 'free';
    
    const result = this.updateUser(userId, {
      plan: newPlan,
      plan_changed_at: new Date().toISOString()
    });

    if (result.success) {
      this.recordPlanChange(userId, oldPlan, newPlan, reason, performedBy);
      this.broadcastDataChange('planChanged', { userId, oldPlan, newPlan });
    }

    return result;
  }

  /**
   * Get enriched user data (includes statistics from all sources)
   */
  static getEnrichedUsers() {
    const users = this.getAllUsers();
    const loginHistory = this.getLoginHistory();
    const billingHistory = this.getBillingHistory();
    const planChangeHistory = this.getPlanChangeHistory();

    return users.map(user => {
      const userId = user.id;
      
      // Get user-specific data
      const userLogins = loginHistory.filter(l => l.userId === userId);
      const userBilling = billingHistory.filter(b => b.userId === userId);
      const userPlanChanges = planChangeHistory.filter(p => p.userId === userId);

      // Calculate enrichments
      const lastLogin = userLogins.length > 0
        ? userLogins.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;

      const totalSpent = userBilling
        .filter(b => b.status === 'succeeded')
        .reduce((sum, b) => sum + (b.amount || 0), 0);

      return {
        ...user,
        enriched: {
          lastLogin: lastLogin?.timestamp,
          loginCount: userLogins.length,
          totalSpent,
          planChanges: userPlanChanges.length,
          lastPlanChange: userPlanChanges.length > 0
            ? userPlanChanges.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
            : null
        }
      };
    });
  }

  /**
   * Refresh all data from storage
   */
  static refreshData() {
    this.clearCache();
    const users = this.getAllUsers();
    const stats = this.getPlatformStatistics();
    
    this.broadcastDataChange('dataRefreshed', { 
      userCount: users.length,
      stats 
    });

    console.log('🔄 AdminDataService: All data refreshed');
    return { success: true, userCount: users.length };
  }

  /**
   * Export all data for backup
   */
  static exportAllData() {
    return {
      users: this.getAllUsers(),
      loginHistory: this.getLoginHistory(),
      billingHistory: this.getBillingHistory(),
      planChangeHistory: this.getPlanChangeHistory(),
      statistics: this.getPlatformStatistics(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Get service health check
   */
  static healthCheck() {
    const users = this.getAllUsers();
    const loginHistory = this.getLoginHistory();
    
    return {
      status: 'operational',
      cacheStatus: {
        users: this.isCacheValid(dataCache.users),
        loginHistory: this.isCacheValid(dataCache.loginHistory),
        statistics: this.isCacheValid(dataCache.statistics)
      },
      dataStatus: {
        usersLoaded: users.length > 0,
        loginHistoryLoaded: loginHistory.length >= 0
      },
      timestamp: new Date().toISOString()
    };
  }
}

export default AdminDataService;
