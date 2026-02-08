/**
 * Accounts Management Service
 * Platform-level management of business accounts with usage tracking and health monitoring
 */

const STORAGE_KEY = 'breakapi_business_accounts';
const ACCOUNT_ACTIVITY_KEY = 'breakapi_account_activity';

class AccountsManagementService {
  /**
   * Get all business accounts
   */
  static getAllAccounts() {
    const accounts = this.loadAccounts();
    return accounts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get specific account by ID
   */
  static getAccountById(accountId) {
    const accounts = this.loadAccounts();
    return accounts.find(a => a.id === accountId);
  }

  /**
   * Get account summary statistics
   */
  static getAccountsSummary() {
    const accounts = this.getAllAccounts();
    
    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'active').length,
      accountsAtCapacity: accounts.filter(a => a.health === 'high_usage').length,
      flaggedAccounts: accounts.filter(a => a.health === 'flagged').length,
      totalUsers: accounts.reduce((sum, a) => sum + a.user_count, 0),
      totalDocuments: accounts.reduce((sum, a) => sum + a.document_count, 0)
    };
  }

  /**
   * Get account health status
   */
  static getAccountHealth(account) {
    const storageUsagePercent = account.storage_used / (account.storage_limit || 100) * 100;
    const documentUsagePercent = account.document_count / (account.document_limit || 1000) * 100;
  
    let health = 'normal';
    if (account.status === 'suspended') health = 'flagged';
    else if (storageUsagePercent >= 90 || documentUsagePercent >= 90) health = 'high_usage';
    else if (account.pending_payment_count > 0) health = 'flagged';
    
    return health;
  }

  /**
   * Get accounts by health status
   */
  static getAccountsByHealth(health) {
    const accounts = this.getAllAccounts();
    return accounts.filter(a => this.getAccountHealth(a) === health);
  }

  /**
   * Change account plan
   */
  static changeAccountPlan(accountId, newPlan, reason = '') {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    const oldPlan = accounts[accountIndex].plan;
    accounts[accountIndex].plan = newPlan;
    accounts[accountIndex].plan_changed_at = new Date().toISOString();
    accounts[accountIndex].plan_change_reason = reason;

    this.saveAccounts(accounts);
    this.recordAccountActivity('plan_change', accountId, `Changed from ${oldPlan} to ${newPlan}`);
    
    return true;
  }

  /**
   * Apply discount to account
   */
  static applyDiscount(accountId, discountPercent, reason = '', duration = 'one_time') {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    if (!accounts[accountIndex].discounts) {
      accounts[accountIndex].discounts = [];
    }

    accounts[accountIndex].discounts.push({
      id: Date.now().toString(),
      percent: discountPercent,
      reason,
      duration,
      applied_at: new Date().toISOString(),
      applied_by: 'admin'
    });

    accounts[accountIndex].effective_discount = accounts[accountIndex].discounts.reduce((sum, d) => sum + d.percent, 0);
    accounts[accountIndex].updated_at = new Date().toISOString();

    this.saveAccounts(accounts);
    this.recordAccountActivity('discount_applied', accountId, `${discountPercent}% discount applied: ${reason}`);
    
    return true;
  }

  /**
   * Create custom plan for account
   */
  static createCustomPlan(accountId, customPlanDetails) {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    accounts[accountIndex].plan_type = 'custom';
    accounts[accountIndex].custom_plan = {
      ...customPlanDetails,
      created_at: new Date().toISOString(),
      created_by: 'admin'
    };
    accounts[accountIndex].updated_at = new Date().toISOString();

    this.saveAccounts(accounts);
    this.recordAccountActivity('custom_plan_created', accountId, `Custom plan created with limits: ${JSON.stringify(customPlanDetails)}`);
    
    return true;
  }

  /**
   * Get billing cycle information
   */
  static getBillingCycle(accountId) {
    const account = this.getAccountById(accountId);
    if (!account) return null;

    const nextRenewalDate = new Date(account.subscription_renewal_date);
    const now = new Date();
    const daysUntilRenewal = Math.ceil((nextRenewalDate - now) / (1000 * 60 * 60 * 24));

    return {
      accountId,
      billingCycle: account.billing_cycle, // monthly, yearly
      renewalDate: account.subscription_renewal_date,
      daysUntilRenewal: Math.max(0, daysUntilRenewal),
      lastBilledDate: account.last_billed_date,
      nextAmount: account.monthly_rate || 0,
      status: daysUntilRenewal <= 0 ? 'due' : daysUntilRenewal <= 7 ? 'upcoming' : 'active'
    };
  }

  /**
   * Cancel subscription
   */
  static cancelSubscription(accountId, reason = '', effective = 'immediate') {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    accounts[accountIndex].subscription_status = 'cancelled';
    accounts[accountIndex].cancelled_at = new Date().toISOString();
    accounts[accountIndex].cancellation_reason = reason;
    accounts[accountIndex].cancellation_effective = effective;
    accounts[accountIndex].status = effective === 'immediate' ? 'inactive' : 'active';

    this.saveAccounts(accounts);
    this.recordAccountActivity('subscription_cancelled', accountId, `Cancelled ${effective}: ${reason}`);
    
    return true;
  }

  /**
   * Pause subscription
   */
  static pauseSubscription(accountId, duration = 30) {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    const resumeDate = new Date();
    resumeDate.setDate(resumeDate.getDate() + duration);

    accounts[accountIndex].subscription_status = 'paused';
    accounts[accountIndex].paused_at = new Date().toISOString();
    accounts[accountIndex].resume_date = resumeDate.toISOString();
    accounts[accountIndex].pause_duration_days = duration;

    this.saveAccounts(accounts);
    this.recordAccountActivity('subscription_paused', accountId, `Paused for ${duration} days`);
    
    return true;
  }

  /**
   * Resume paused subscription
   */
  static resumeSubscription(accountId) {
    const accounts = this.loadAccounts();
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) return false;

    accounts[accountIndex].subscription_status = 'active';
    accounts[accountIndex].resumed_at = new Date().toISOString();

    this.saveAccounts(accounts);
    this.recordAccountActivity('subscription_resumed', accountId, 'Subscription resumed');
    
    return true;
  }

  /**
   * Get accounts with high usage
   */
  static getHighUsageAccounts() {
    const accounts = this.getAllAccounts();
    return accounts.filter(a => {
      const storagePercent = a.storage_used / a.storage_limit * 100;
      const docPercent = a.document_count / a.document_limit * 100;
      return storagePercent >= 80 || docPercent >= 80;
    });
  }

  /**
   * Get accounts with failed payments (future-ready)
   */
  static getFailedPaymentAccounts() {
    const accounts = this.getAllAccounts();
    return accounts.filter(a => a.pending_payment_count > 0 || a.failed_payment_count > 0);
  }

  /**
   * Track payment status
   */
  static updatePaymentStatus(accountId, paymentId, status, amount, reason = '') {
    const accounts = this.loadAccounts();
    const account = accounts.find(a => a.id === accountId);
    
    if (!account) return false;

    if (!account.payment_history) {
      account.payment_history = [];
    }

    account.payment_history.push({
      id: paymentId,
      amount,
      status, // successful, failed, pending, refunded
      date: new Date().toISOString(),
      reason
    });

    // Update account status based on payment
    if (status === 'failed') {
      account.failed_payment_count = (account.failed_payment_count || 0) + 1;
      if (account.failed_payment_count >= 3) {
        account.status = 'suspended';
        account.suspension_reason = 'Multiple failed payments';
      }
    } else if (status === 'successful') {
      account.failed_payment_count = 0;
      account.last_payment_date = new Date().toISOString();
    }

    this.saveAccounts(accounts);
    this.recordAccountActivity('payment_updated', accountId, `Payment ${status}: $${amount}`);
    
    return true;
  }

  /**
   * Get account activity log
   */
  static getAccountActivityLog(accountId = null) {
    const activities = JSON.parse(localStorage.getItem(ACCOUNT_ACTIVITY_KEY) || '[]');
    
    if (accountId) {
      return activities
        .filter(a => a.accountId === accountId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get account usage trends
   */
  static getAccountUsageTrend() {
    const trends = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      trends.push({
        date: dateStr,
        storage: Math.floor(Math.random() * 80 + 20), // Simulated
        documents: Math.floor(Math.random() * 500 + 100), // Simulated
        users: Math.floor(Math.random() * 15 + 5) // Simulated
      });
    }
    return trends;
  }

  /**
   * Export accounts data
   */
  static exportAccounts() {
    const accounts = this.getAllAccounts();
    const summary = this.getAccountsSummary();
    const activityLog = this.getAccountActivityLog();

    return {
      exportDate: new Date().toISOString(),
      summary,
      accounts: accounts.map(a => ({
        ...a,
        health: this.getAccountHealth(a),
        billingCycle: this.getBillingCycle(a.id)
      })),
      activityLog
    };
  }

  // ==================== Private Helper Methods ====================

  static loadAccounts() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    const sampleAccounts = this.generateSampleAccounts();
    this.saveAccounts(sampleAccounts);
    return sampleAccounts;
  }

  static saveAccounts(accounts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }

  static generateSampleAccounts() {


    return [
      {
        id: '1',
        name: 'Acme Corporation',
        email: 'billing@acme.com',
        plan: 'enterprise',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'active',
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'yearly',
        monthly_rate: 299,
        user_count: 25,
        document_count: 850,
        storage_used: 45,
        storage_limit: 100,
        document_limit: 5000,
        health: 'normal',
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '2',
        name: 'TechStart Inc',
        email: 'admin@techstart.com',
        plan: 'professional',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'active',
        created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'monthly',
        monthly_rate: 99,
        user_count: 8,
        document_count: 320,
        storage_used: 28,
        storage_limit: 50,
        document_limit: 1000,
        health: 'normal',
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '3',
        name: 'Global Solutions Ltd',
        email: 'finance@globalsol.com',
        plan: 'professional',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'active',
        created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'monthly',
        monthly_rate: 99,
        user_count: 12,
        document_count: 680,
        storage_used: 42,
        storage_limit: 50,
        document_limit: 1000,
        health: 'high_usage',
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '4',
        name: 'Innovation Labs Co',
        email: 'admin@innovlabs.com',
        plan: 'starter',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'active',
        created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'yearly',
        monthly_rate: 49,
        user_count: 3,
        document_count: 150,
        storage_used: 8,
        storage_limit: 25,
        document_limit: 500,
        health: 'normal',
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '5',
        name: 'Digital Dreams Agency',
        email: 'contact@digitaldreams.com',
        plan: 'professional',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'paused',
        created_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'monthly',
        monthly_rate: 99,
        user_count: 5,
        document_count: 420,
        storage_used: 22,
        storage_limit: 50,
        document_limit: 1000,
        health: 'normal',
        paused_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        resume_date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '6',
        name: 'Startup Ventures LLC',
        email: 'admin@startupalpha.com',
        plan: 'free',
        plan_type: 'standard',
        status: 'active',
        subscription_status: 'active',
        created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'monthly',
        monthly_rate: 0,
        user_count: 1,
        document_count: 45,
        storage_used: 3,
        storage_limit: 10,
        document_limit: 100,
        health: 'normal',
        payment_history: [],
        failed_payment_count: 0,
        pending_payment_count: 0
      },
      {
        id: '7',
        name: 'Enterprise Systems Corp',
        email: 'billing@esyscorp.com',
        plan: 'enterprise',
        plan_type: 'custom',
        status: 'suspended',
        subscription_status: 'cancelled',
        created_at: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_renewal_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        billing_cycle: 'yearly',
        monthly_rate: 499,
        user_count: 0,
        document_count: 0,
        storage_used: 0,
        storage_limit: 500,
        document_limit: 50000,
        health: 'flagged',
        payment_history: [],
        failed_payment_count: 2,
        pending_payment_count: 1,
        cancellation_reason: 'Payment failed',
        suspension_reason: 'Multiple failed payments'
      }
    ];
  }

  static recordAccountActivity(action, accountId, details = '') {
    const activities = JSON.parse(localStorage.getItem(ACCOUNT_ACTIVITY_KEY) || '[]');
    
    activities.push({
      id: Date.now().toString(),
      action,
      accountId,
      details,
      timestamp: new Date().toISOString(),
      performedBy: 'admin'
    });

    localStorage.setItem(ACCOUNT_ACTIVITY_KEY, JSON.stringify(activities));
  }
}

export default AccountsManagementService;
