/**
 * UserManagementService
 * Comprehensive user management and monitoring system
 * Tracks user status, login history, usage limits, and enables admin controls
 * Now uses AdminDataService for unified data access
 */

import AdminDataService from './AdminDataService';

const STORAGE_KEY = 'breakapi_user_management';

class UserManagementService {
  /**
   * Get all users with their complete information
   */
  static getAllUsers() {
    const users = AdminDataService.getAllUsers();
    return users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get specific user by ID
   */
  static getUserById(userId) {
    return AdminDataService.getUserById(userId);
  }

  /**
   * Get user status breakdown (active, suspended, trial)
   */
  static getUserStatus() {
    const users = AdminDataService.getAllUsers();
    const breakdown = {
      active: 0,
      suspended: 0,
      trial: 0,
      total: users.length
    };

    users.forEach(user => {
      if (user.status === 'suspended') breakdown.suspended++;
      else if (user.status === 'trial') breakdown.trial++;
      else breakdown.active++;
    });

    return breakdown;
  }

  /**
   * Get users grouped by subscription plan
   */
  static getUsersPerPlan() {
    const users = AdminDataService.getAllUsers();
    const plans = {
      free: { count: 0, active: 0, suspended: 0, trial: 0 },
      starter: { count: 0, active: 0, suspended: 0, trial: 0 },
      professional: { count: 0, active: 0, suspended: 0, trial: 0 },
      enterprise: { count: 0, active: 0, suspended: 0, trial: 0 }
    };

    users.forEach(user => {
      const plan = user.plan || 'free';
      if (plans[plan]) {
        plans[plan].count++;
        const status = user.status || 'active';
        if (status === 'active') plans[plan].active++;
        else if (status === 'suspended') plans[plan].suspended++;
        else if (status === 'trial') plans[plan].trial++;
      }
    });

    return plans;
  }

  /**
   * Get login history for a specific user
   */
  static getLoginHistory(userId = null) {
    return AdminDataService.getLoginHistory(userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Record user login activity
   */
  static recordLoginActivity(userId, userEmail) {
    return AdminDataService.recordLoginActivity(userId, userEmail, {
      ipAddress: '192.168.1.1', // Simulated
      browser: 'Chrome', // Simulated
      location: 'New York, USA' // Simulated
    });
  }

  /**
   * Get usage limits and consumption for a user
   */
  static getUserUsageLimits(userId) {
    const user = this.getUserById(userId);
    if (!user) return null;

    const planLimits = {
      free: { clients: 5, users: 1, documents: 50, storage: 1 }, // 1 GB
      starter: { clients: 50, users: 3, documents: 500, storage: 10 }, // 10 GB
      professional: { clients: 500, users: 10, documents: 5000, storage: 100 }, // 100 GB
      enterprise: { clients: -1, users: -1, documents: -1, storage: -1 } // Unlimited
    };

    const plan = user.plan || 'free';
    const limits = planLimits[plan];

    // Simulate usage data
    const usage = {
      clients: Math.floor(Math.random() * (limits.clients > 0 ? limits.clients : 100)),
      users: Math.floor(Math.random() * (limits.users > 0 ? limits.users : 10)),
      documents: Math.floor(Math.random() * (limits.documents > 0 ? limits.documents : 500)),
      storage: Number((Math.random() * (limits.storage > 0 ? limits.storage : 50)).toFixed(2))
    };

    return {
      userId,
      plan,
      limits,
      usage,
      percentages: {
        clients: limits.clients > 0 ? Math.round((usage.clients / limits.clients) * 100) : 0,
        users: limits.users > 0 ? Math.round((usage.users / limits.users) * 100) : 0,
        documents: limits.documents > 0 ? Math.round((usage.documents / limits.documents) * 100) : 0,
        storage: limits.storage > 0 ? Math.round((usage.storage / limits.storage) * 100) : 0
      }
    };
  }

  /**
   * Suspend a user account
   */
  static suspendUser(userId, reason = '') {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) return false;

    users[userIndex].status = 'suspended';
    users[userIndex].suspendedAt = new Date().toISOString();
    users[userIndex].suspendReason = reason;
    users[userIndex].suspendedBy = 'admin'; // Simulated admin user

    this.saveUsers(users);
    this.recordUserAction('suspend', userId, reason);
    
    return true;
  }

  /**
   * Reactivate a suspended user
   */
  static reactivateUser(userId, reason = '') {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) return false;

    users[userIndex].status = 'active';
    users[userIndex].reactivatedAt = new Date().toISOString();
    users[userIndex].reactivationReason = reason;
    users[userIndex].reactivatedBy = 'admin'; // Simulated admin user

    this.saveUsers(users);
    this.recordUserAction('reactivate', userId, reason);
    
    return true;
  }

  /**
   * Reset password for a user (support-level access)
   */
  static resetPassword(userId) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) return null;

    const tempPassword = this.generateTempPassword();
    users[userIndex].passwordResetAt = new Date().toISOString();
    users[userIndex].passwordResetBy = 'admin'; // Simulated admin user
    users[userIndex].requiresPasswordReset = true;

    this.saveUsers(users);
    this.recordUserAction('password_reset', userId, `Temporary password generated: ${tempPassword}`);

    return {
      userId,
      userEmail: users[userIndex].email,
      tempPassword,
      expiresIn: '24 hours'
    };
  }

  /**
   * Get user activity summary
   */
  static getUserActivitySummary() {
    const users = this.getAllUsers();
    const loginHistory = this.getLoginHistory();
    
    return {
      totalUsers: users.length,
      activeToday: loginHistory.filter(l => {
        const today = new Date().toDateString();
        const loginDate = new Date(l.timestamp).toDateString();
        return loginDate === today;
      }).length,
      activeThisWeek: loginHistory.filter(l => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(l.timestamp) >= weekAgo;
      }).length,
      activeThisMonth: loginHistory.filter(l => {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return new Date(l.timestamp) >= monthAgo;
      }).length
    };
  }

  /**
   * Get daily user login trend for last 30 days
   */
  static getDailyLoginTrend() {
    const loginHistory = this.getLoginHistory();
    const trend = {};

    // Initialize last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trend[dateStr] = 0;
    }

    // Count logins per day
    loginHistory.forEach(entry => {
      const dateStr = entry.timestamp.split('T')[0];
      if (dateStr in trend) {
        trend[dateStr]++;
      }
    });

    return Object.entries(trend).map(([date, logins]) => ({
      date,
      logins,
      uniqueUsers: Math.ceil(Math.random() * logins + logins * 0.7) // Simulated unique users
    }));
  }

  /**
   * Get user actions/audit log
   */
  static getUserActionLog() {
    const actions = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_actions`) || '[]');
    return actions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Search users by email, name, or plan
   */
  static searchUsers(query) {
    const users = this.getAllUsers();
    const lowerQuery = query.toLowerCase();

    return users.filter(user => 
      user.email.toLowerCase().includes(lowerQuery) ||
      (user.name && user.name.toLowerCase().includes(lowerQuery)) ||
      (user.plan && user.plan.includes(lowerQuery))
    );
  }

  /**
   * Export user data as JSON
   */
  static exportUsers() {
    const users = this.getAllUsers();
    const loginHistory = this.getLoginHistory();
    const actionLog = this.getUserActionLog();
    const activitySummary = this.getUserActivitySummary();

    return {
      exportDate: new Date().toISOString(),
      summary: activitySummary,
      users: users.map(u => ({
        ...u,
        usageLimits: this.getUserUsageLimits(u.id)
      })),
      loginHistory,
      actionLog
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Load users from localStorage
   */
  static loadUsers() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Initialize with sample users if not exists
    const sampleUsers = this.generateSampleUsers();
    this.saveUsers(sampleUsers);
    return sampleUsers;
  }

  /**
   * Save users to localStorage
   */
  static saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  /**
   * Generate sample users for demo
   */
  static generateSampleUsers() {


    return [
      {
        id: '1',
        email: 'admin@company.com',
        name: 'Alex Johnson',
        company: 'Acme Corp',
        plan: 'enterprise',
        status: 'active',
        created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        role: 'admin'
      },
      {
        id: '2',
        email: 'sarah@techstart.com',
        name: 'Sarah Mitchell',
        company: 'TechStart Inc',
        plan: 'professional',
        status: 'active',
        created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        role: 'user'
      },
      {
        id: '3',
        email: 'mike@globalsol.com',
        name: 'Mike Chen',
        company: 'Global Solutions',
        plan: 'professional',
        status: 'active',
        created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        role: 'user'
      },
      {
        id: '4',
        email: 'jessica@innovlabs.com',
        name: 'Jessica Park',
        company: 'Innovation Labs',
        plan: 'starter',
        status: 'active',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        role: 'user'
      },
      {
        id: '5',
        email: 'james@digitaldreams.com',
        name: 'James Wilson',
        company: 'Digital Dreams',
        plan: 'professional',
        status: 'suspended',
        created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        role: 'user',
        suspendedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        suspendReason: 'Payment failed'
      },
      {
        id: '6',
        email: 'anna@company2.com',
        name: 'Anna Rodriguez',
        company: 'Acme Corp',
        plan: 'starter',
        status: 'trial',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        role: 'user',
        trialEndsAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '7',
        email: 'david@startup.com',
        name: 'David Bell',
        company: 'StartUp Inc',
        plan: 'free',
        status: 'active',
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        role: 'user'
      }
    ];
  }

  /**
   * Record user action for audit log
   */
  static recordUserAction(action, userId, details = '') {
    const actions = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_actions`) || '[]');
    
    actions.push({
      id: Date.now().toString(),
      action,
      userId,
      details,
      timestamp: new Date().toISOString(),
      performedBy: 'admin'
    });

    localStorage.setItem(`${STORAGE_KEY}_actions`, JSON.stringify(actions));
  }

  /**
   * Generate temporary password
   */
  static generateTempPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

export default UserManagementService;
