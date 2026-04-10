/**
 * SubscriptionManagementService
 * Admin-level subscription management system for viewing, modifying, and controlling all user subscriptions
 * Now uses AdminDataService for unified data access
 */

import AdminDataService from './AdminDataService';
import { adminCacheGet, adminCacheSet } from '@/lib/adminLocalCache';
import PlanManagementService from "@/services/PlanManagementService";
import NotificationService from '@/components/notifications/NotificationService';

const BILLING_HISTORY_KEY = 'breakapi_billing_history';

class SubscriptionManagementService {
  /**
   * Convert user data to subscription format
   * System admins (isSystemAdmin=true) are excluded from subscriptions
   */
  static userToSubscription(user) {
    // Skip system admin users - they don't have subscriptions
    if (user.isSystemAdmin) return null;
    
    const now = new Date();
    const trialEndsAt = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
    const isTrialActive = trialEndsAt && trialEndsAt > now;
    
    return {
      id: `sub_${user.id || user.email}`,
      userId: user.id || user.email,
      userName: user.full_name || user.display_name || 'Unknown',
      userEmail: user.email,
      currentPlan: user.plan || 'free',
      status: isTrialActive ? 'trial' : (user.status === 'active' ? 'active' : user.status || 'active'),
      billingCycle: user.billing_cycle || 'monthly',
      createdAt: user.created_at || new Date().toISOString(),
      renewalDate: user.renewal_date || this.calculateNextRenewal(user.billing_cycle || 'monthly'),
      currentCycleStart: user.current_cycle_start || user.created_at || new Date().toISOString(),
      paymentStatus: user.payment_status || 'succeeded',
      trialEndsAt: user.trial_ends_at,
      trialStartedAt: user.trial_started_at,
      discounts: user.discounts || [],
      planChangeHistory: user.plan_change_history || [],
      customPrice: user.custom_price
    };
  }

  static calculateNextRenewal(billingCycle) {
    const date = new Date();
    if (billingCycle === 'annual') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    return date.toISOString();
  }

  /**
   * Get all subscriptions across the platform
   */
  static getAllSubscriptions() {
    const users = AdminDataService.getAllUsers();
    const subscriptions = users
      .map(user => this.userToSubscription(user))
      .filter(sub => sub !== null);
    return subscriptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get subscription by user ID
   */
  static getSubscriptionByUserId(userId) {
    const subscriptions = this.loadSubscriptions();
    return subscriptions.find(s => s.userId === userId);
  }

  /**
   * Get subscription by ID
   */
  static getSubscriptionById(subscriptionId) {
    const subscriptions = this.loadSubscriptions();
    return subscriptions.find(s => s.id === subscriptionId);
  }

  /**
   * Get subscriptions by status
   */
  static getSubscriptionsByStatus(status) {
    const subscriptions = this.loadSubscriptions();
    return subscriptions.filter(s => s.status === status);
  }

  /**
   * Get subscriptions grouped by plan type
   */
  static getSubscriptionsByPlan() {
    const subscriptions = this.loadSubscriptions();
    const grouped = {
      free: [],
      starter: [],
      professional: [],
      enterprise: []
    };

    subscriptions.forEach(sub => {
      const plan = sub.currentPlan || 'free';
      if (grouped[plan]) {
        grouped[plan].push(sub);
      }
    });

    return grouped;
  }

  /**
   * Get subscription summary statistics
   */
  static getSubscriptionSummary() {
    const subscriptions = this.loadSubscriptions();
    const summary = {
      total: subscriptions.length,
      active: 0,
      paused: 0,
      cancelled: 0,
      trial: 0,
      pending_payment: 0,
      failed_payment: 0,
      plans: {
        free: 0,
        starter: 0,
        professional: 0,
        enterprise: 0
      },
      mrr: 0, // Monthly Recurring Revenue
      arr: 0  // Annual Recurring Revenue
    };

    const resolvePlanPrice = (subscription) => {
      if (subscription.customPrice !== null && subscription.customPrice !== undefined) {
        return Number(subscription.customPrice) || 0;
      }

      const planKey = subscription.currentPlan || 'free';
      const plan = PlanManagementService.getPlan(planKey);
      if (!plan) return 0;

      if (subscription.billingCycle === 'annual') {
        const yearly = Number(plan.priceYearly || 0);
        if (yearly > 0) return yearly;
        const monthlyFallback = Number(plan.priceMonthly || 0);
        return monthlyFallback * 12;
      }

      const monthly = Number(plan.priceMonthly || 0);
      if (monthly > 0) return monthly;
      const yearlyFallback = Number(plan.priceYearly || 0);
      return yearlyFallback / 12;
    };

    subscriptions.forEach(sub => {
      if (sub.status === 'active') summary.active++;
      if (sub.status === 'paused') summary.paused++;
      if (sub.status === 'cancelled') summary.cancelled++;
      if (sub.status === 'trial') summary.trial++;
      if (sub.paymentStatus === 'pending') summary.pending_payment++;
      if (sub.paymentStatus === 'failed') summary.failed_payment++;

      const plan = sub.currentPlan || 'free';
      if (summary.plans[plan] !== undefined) {
        summary.plans[plan]++;
      }

      // Calculate MRR and ARR only for active subscriptions
      if (sub.status === 'active') {
        const price = resolvePlanPrice(sub);
        if (sub.billingCycle === 'annual') {
          summary.arr += price;
          summary.mrr += price / 12;
        } else {
          summary.mrr += price;
          summary.arr += price * 12;
        }
      }
    });

    return summary;
  }

  /**
   * Change user's subscription plan
   */
  static changePlan(subscriptionId, newPlan, reason = '') {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    const previousPlan = subscription.currentPlan;

    subscription.currentPlan = newPlan;
    subscription.planChangedAt = new Date().toISOString();
    subscription.planChangeReason = reason;
    subscription.planChangeBy = 'admin';
    subscription.planChangeHistory = subscription.planChangeHistory || [];
    subscription.planChangeHistory.push({
      from: previousPlan,
      to: newPlan,
      date: new Date().toISOString(),
      reason,
      changedBy: 'admin'
    });

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('plan_change', subscriptionId, {
      from: previousPlan,
      to: newPlan,
      reason
    });

    return true;
  }

  /**
   * Apply discount to subscription
   */
  static applyDiscount(subscriptionId, discountType, discountValue, reason = '', expiresAt = null) {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];

    if (!subscription.discounts) {
      subscription.discounts = [];
    }

    const discount = {
      id: Date.now().toString(),
      type: discountType, // 'percentage' or 'fixed'
      value: discountValue,
      reason,
      appliedAt: new Date().toISOString(),
      appliedBy: 'admin',
      expiresAt: expiresAt || null
    };

    subscription.discounts.push(discount);

    // Calculate effective price
    subscription.discountedPrice = this.calculateDiscountedPrice(subscription);

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('discount_applied', subscriptionId, discount);

    return discount;
  }

  /**
   * Remove discount from subscription
   */
  static removeDiscount(subscriptionId, discountId) {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    subscription.discounts = (subscription.discounts || []).filter(d => d.id !== discountId);

    // Recalculate effective price
    subscription.discountedPrice = this.calculateDiscountedPrice(subscription);

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('discount_removed', subscriptionId, { discountId });

    return true;
  }

  /**
   * Create custom plan for subscription
   */
  static createCustomPlan(subscriptionId, customPlanConfig, reason = '') {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];

    subscription.isCustomPlan = true;
    subscription.customPlanConfig = customPlanConfig;
    subscription.customPrice = customPlanConfig.price;
    subscription.customPlanCreatedAt = new Date().toISOString();
    subscription.customPlanReason = reason;
    subscription.customPlanCreatedBy = 'admin';

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('custom_plan_created', subscriptionId, customPlanConfig);

    return true;
  }

  /**
   * Pause subscription
   */
  static pauseSubscription(subscriptionId, reason = '', duration = null) {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    subscription.status = 'paused';
    subscription.pausedAt = new Date().toISOString();
    subscription.pauseReason = reason;
    subscription.pauseResumeExpiry = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString() : null;

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('subscription_paused', subscriptionId, { reason, duration });

    return true;
  }

  /**
   * Resume paused subscription
   */
  static resumeSubscription(subscriptionId, reason = '') {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    subscription.status = 'active';
    subscription.resumedAt = new Date().toISOString();
    subscription.resumeReason = reason;
    subscription.pausedAt = null;
    subscription.pauseResumeExpiry = null;

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('subscription_resumed', subscriptionId, { reason });

    return true;
  }

  /**
   * Cancel subscription
   */
  static cancelSubscription(subscriptionId, reason = '', immediate = false) {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date().toISOString();
    subscription.cancellationReason = reason;
    subscription.cancelledBy = 'admin';
    subscription.immediateCancel = immediate;

    if (!immediate) {
      // Set end date to end of current billing period
      const endDate = new Date(subscription.renewalDate);
      subscription.cancellationEffectiveDate = endDate.toISOString();
    } else {
      subscription.cancellationEffectiveDate = new Date().toISOString();
    }

    this.saveSubscriptions(subscriptions);
    this.recordBillingEvent('subscription_cancelled', subscriptionId, {
      reason,
      immediate,
      effectiveDate: subscription.cancellationEffectiveDate
    });

    return true;
  }

  /**
   * View billing cycle details
   */
  static getBillingCycleDetails(subscriptionId) {
    const subscription = this.getSubscriptionById(subscriptionId);
    if (!subscription) return null;

    const now = new Date();
    const renewalDate = new Date(subscription.renewalDate);
    const startDate = new Date(subscription.currentCycleStart);

    const daysUntilRenewal = Math.ceil((renewalDate - now) / (1000 * 60 * 60 * 24));
    const cycleProgress = ((now - startDate) / (renewalDate - startDate)) * 100;

    return {
      subscriptionId,
      currentCycleStart: subscription.currentCycleStart,
      renewalDate: subscription.renewalDate,
      billingCycle: subscription.billingCycle,
      daysUntilRenewal,
      cycleProgress: Math.min(cycleProgress, 100),
      price: subscription.customPrice || this.getBasePlanPrice(subscription.currentPlan),
      discounts: subscription.discounts || [],
      effectivePrice: subscription.discountedPrice || subscription.customPrice || this.getBasePlanPrice(subscription.currentPlan)
    };
  }

  /**
   * Record payment status
   */
  static recordPaymentStatus(subscriptionId, status, amount, details = null) {
    const subscriptions = this.loadSubscriptions();
    const subIndex = subscriptions.findIndex(s => s.id === subscriptionId);

    if (subIndex === -1) return false;

    const subscription = subscriptions[subIndex];
    const previousStatus = subscription.paymentStatus;
    subscription.paymentStatus = status; // 'pending', 'failed', 'succeeded'
    subscription.lastPaymentAttempt = new Date().toISOString();
    subscription.lastPaymentAmount = amount;

    if (status === 'failed') {
      subscription.failedPaymentCount = (subscription.failedPaymentCount || 0) + 1;
    } else if (status === 'succeeded') {
      subscription.failedPaymentCount = 0;
      if (subscription.status === 'paused') {
        subscription.status = 'active';
        subscription.resumedAt = new Date().toISOString();
        subscription.pauseReason = null;
        subscription.pausedAt = null;
        subscription.pauseResumeExpiry = null;
        this.recordBillingEvent('subscription_resumed', subscriptionId, {
          reason: 'payment_succeeded',
          source: details?.manual ? 'manual_payment_update' : 'payment_gateway'
        });
      }
      if (subscription.status === 'trial') {
        subscription.status = 'active';
      }
    }

    this.saveSubscriptions(subscriptions);

    if (status === 'succeeded') {
      const userUpdate = {
        status: 'active',
        payment_status: 'succeeded',
        last_payment_amount: amount,
        last_payment_attempt: subscription.lastPaymentAttempt
      };

      AdminDataService.updateUser(subscription.userId, userUpdate);
    }

    if (status === 'succeeded' && previousStatus === 'failed' && details?.manual) {
      this.recordBillingEvent('payment_retry_succeeded', subscriptionId, {
        previousStatus,
        amount,
        details
      });
    }

    if (details?.manual) {
      const title = status === 'succeeded'
        ? 'Payment marked as received'
        : 'Payment marked as failed';
      const message = status === 'succeeded'
        ? 'Your subscription payment was confirmed. Your access is active.'
        : 'We could not confirm your latest subscription payment. Please update your billing details.';

      NotificationService.createNotification(
        subscription.userId,
        title,
        message,
        'subscription_payment_update',
        subscriptionId
      );
    }

    this.recordBillingEvent('payment_status_recorded', subscriptionId, {
      status,
      amount,
      details
    });

    return true;
  }

  /**
   * Get failed and pending payments
   */
  static getFailedAndPendingPayments() {
    const subscriptions = this.loadSubscriptions();
    const issues = [];

    subscriptions.forEach(sub => {
      if (sub.paymentStatus === 'failed') {
        issues.push({
          type: 'failed',
          subscriptionId: sub.id,
          userId: sub.userId,
          userName: sub.userName,
          userEmail: sub.userEmail,
          amount: sub.lastPaymentAmount,
          lastAttempt: sub.lastPaymentAttempt,
          failedCount: sub.failedPaymentCount,
          plan: sub.currentPlan
        });
      } else if (sub.paymentStatus === 'pending') {
        issues.push({
          type: 'pending',
          subscriptionId: sub.id,
          userId: sub.userId,
          userName: sub.userName,
          userEmail: sub.userEmail,
          amount: sub.lastPaymentAmount,
          lastAttempt: sub.lastPaymentAttempt,
          plan: sub.currentPlan
        });
      }
    });

    return issues;
  }

  /**
   * Get billing history for subscription
   */
  static getBillingHistory(subscriptionId = null) {
    const history = JSON.parse(adminCacheGet(BILLING_HISTORY_KEY) || '[]');

    if (subscriptionId) {
      return history
        .filter(entry => entry.subscriptionId === subscriptionId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get upcoming renewals (next 7 days)
   */
  static getUpcomingRenewals() {
    const subscriptions = this.loadSubscriptions();
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return subscriptions
      .filter(sub => {
        const renewalDate = new Date(sub.renewalDate);
        return sub.status === 'active' && renewalDate > now && renewalDate <= sevenDaysFromNow;
      })
      .map(sub => ({
        subscriptionId: sub.id,
        userId: sub.userId,
        userName: sub.userName,
        userEmail: sub.userEmail,
        plan: sub.currentPlan,
        renewalDate: sub.renewalDate,
        amount: sub.customPrice || this.getBasePlanPrice(sub.currentPlan),
        daysUntilRenewal: Math.ceil((new Date(sub.renewalDate) - now) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));
  }

  /**
   * Export subscription data
   */
  static exportSubscriptions() {
    const subscriptions = this.loadSubscriptions();
    const summary = this.getSubscriptionSummary();
    const billingHistory = this.getBillingHistory();
    const failed = this.getFailedAndPendingPayments();
    const upcoming = this.getUpcomingRenewals();

    return {
      exportDate: new Date().toISOString(),
      summary,
      subscriptions,
      billingHistory,
      failedAndPending: failed,
      upcomingRenewals: upcoming
    };
  }

  // ==================== Private Helper Methods ====================

  static loadSubscriptions() {
    // Now uses AdminDataService for unified data access
    const users = AdminDataService.getAllUsers();
    return users
      .map(user => this.userToSubscription(user))
      .filter(sub => sub !== null)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static saveSubscriptions(subscriptions) {
    // Use AdminDataService for consistent data updates
    try {
      subscriptions.forEach(sub => {
        const updates = {
          plan: sub.currentPlan,
          status: sub.status === 'trial' ? 'active' : sub.status,
          billing_cycle: sub.billingCycle,
          renewal_date: sub.renewalDate,
          current_cycle_start: sub.currentCycleStart,
          payment_status: sub.paymentStatus,
          trial_ends_at: sub.trialEndsAt,
          trial_started_at: sub.trialStartedAt,
          discounts: sub.discounts,
          plan_change_history: sub.planChangeHistory,
          custom_price: sub.customPrice
        };
        
        AdminDataService.updateUser(sub.userId, updates);
      });
      
      console.log('✅ SubscriptionManagementService: Subscriptions saved via AdminDataService');
    } catch (error) {
      console.error('❌ Error saving subscriptions:', error);
    }
  }

  static recordBillingEvent(eventType, subscriptionId, details) {
    const history = JSON.parse(adminCacheGet(BILLING_HISTORY_KEY) || '[]');

    history.push({
      id: Date.now().toString(),
      eventType,
      subscriptionId,
      details,
      timestamp: new Date().toISOString(),
      recordedBy: 'admin'
    });

    adminCacheSet(BILLING_HISTORY_KEY, JSON.stringify(history));
  }

  static calculateDiscountedPrice(subscription) {
    const basePrices = {
      free: 0,
      basic: 19,
      starter: 29,
      premium: 79,
      professional: 99,
      enterprise: 299
    };

    let price = subscription.customPrice || basePrices[subscription.currentPlan] || 0;

    if (subscription.discounts && subscription.discounts.length > 0) {
      subscription.discounts.forEach(discount => {
        if (discount.type === 'percentage') {
          price = price * (1 - discount.value / 100);
        } else if (discount.type === 'fixed') {
          price = Math.max(0, price - discount.value);
        }
      });
    }

    return price;
  }

  static getBasePlanPrice(plan) {
    const prices = {
      free: 0,
      basic: 19,
      starter: 29,
      premium: 79,
      professional: 99,
      enterprise: 299
    };
    return prices[plan] || 0;
  }
}

export default SubscriptionManagementService;
