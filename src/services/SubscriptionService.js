/**
 * Subscription Service
 * Manages subscription data, tracking, and analytics
 */

import PlanManagementService from "@/services/PlanManagementService";

const STORAGE_KEY = 'breakapi_users';
const SUBSCRIPTION_ACTIVITY_KEY = 'subscription_activity_log';

export class SubscriptionService {
  /**
   * Get all users with subscription info
   */
  static getAllUsersWithSubscriptions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  /**
   * Get users grouped by plan type
   * Maps plans to categories: Individual, SME, Corporate
   */
  static getUsersByPlanCategory() {
    const users = this.getAllUsersWithSubscriptions();
    
    const categories = {
      'Individual': {
        plans: ['free', 'starter', 'basic'],
        users: [],
        count: 0,
        percentage: 0
      },
      'SME': {
        plans: ['professional', 'business', 'sme'],
        users: [],
        count: 0,
        percentage: 0
      },
      'Corporate': {
        plans: ['enterprise', 'corporate'],
        users: [],
        count: 0,
        percentage: 0
      }
    };

    // Categorize users
    users.forEach(user => {
      const userPlan = user.plan || 'free';
      
      if (categories.Individual.plans.includes(userPlan)) {
        categories.Individual.users.push(user);
      } else if (categories.SME.plans.includes(userPlan)) {
        categories.SME.users.push(user);
      } else if (categories.Corporate.plans.includes(userPlan)) {
        categories.Corporate.users.push(user);
      } else {
        // Default to Individual for unknown plans
        categories.Individual.users.push(user);
      }
    });

    // Calculate counts and percentages
    const totalUsers = users.length || 1;
    Object.keys(categories).forEach(category => {
      categories[category].count = categories[category].users.length;
      categories[category].percentage = Math.round((categories[category].count / totalUsers) * 100);
    });

    return categories;
  }

  /**
   * Get subscription status breakdown
   */
  static getSubscriptionStatus() {
    const users = this.getAllUsersWithSubscriptions();
    
    const active = users.filter(u => u.status === 'active' && u.plan && u.plan !== 'free').length;
    const cancelled = users.filter(u => u.status === 'cancelled' || u.status === 'inactive').length;
    const paused = users.filter(u => u.status === 'paused').length;
    const trialing = users.filter(u => u.status === 'trial' || (u.plan === 'free' && u.status === 'active')).length;

    const total = users.length || 1;

    return {
      active: {
        count: active,
        percentage: Math.round((active / total) * 100)
      },
      cancelled: {
        count: cancelled,
        percentage: Math.round((cancelled / total) * 100)
      },
      paused: {
        count: paused,
        percentage: Math.round((paused / total) * 100)
      },
      trialing: {
        count: trialing,
        percentage: Math.round((trialing / total) * 100)
      },
      total: total
    };
  }

  /**
   * Get upgrade/downgrade activity
   */
  static getSubscriptionActivity() {
    try {
      const stored = localStorage.getItem(SUBSCRIPTION_ACTIVITY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading subscription activity:', error);
      return [];
    }
  }

  /**
   * Record a subscription activity (upgrade, downgrade, cancel)
   */
  static recordActivity(activity) {
    const activity_log = {
      id: `activity_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: activity.type, // 'upgrade', 'downgrade', 'cancel', 'reactivate', 'extend'
      userId: activity.userId,
      userName: activity.userName,
      userEmail: activity.userEmail,
      fromPlan: activity.fromPlan,
      toPlan: activity.toPlan || null,
      reason: activity.reason || '',
      metadata: activity.metadata || {}
    };

    const activities = this.getSubscriptionActivity();
    activities.unshift(activity_log);

    try {
      localStorage.setItem(SUBSCRIPTION_ACTIVITY_KEY, JSON.stringify(activities));
      return activity_log;
    } catch (error) {
      console.error('Error recording activity:', error);
      return null;
    }
  }

  /**
   * Get subscription metrics
   */
  static getMetrics() {
    const users = this.getAllUsersWithSubscriptions();
    const activity = this.getSubscriptionActivity();
    const status = this.getSubscriptionStatus();

    // Calculate growth metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentUpgrades = activity.filter(a => 
      a.type === 'upgrade' && new Date(a.timestamp) >= thirtyDaysAgo
    ).length;

    const recentDowngrades = activity.filter(a => 
      a.type === 'downgrade' && new Date(a.timestamp) >= thirtyDaysAgo
    ).length;

    const recentCancellations = activity.filter(a => 
      a.type === 'cancel' && new Date(a.timestamp) >= thirtyDaysAgo
    ).length;

    const recentReactivations = activity.filter(a => 
      a.type === 'reactivate' && new Date(a.timestamp) >= thirtyDaysAgo
    ).length;

    // Calculate churn rate (cancellations in last 30 days / active users 30 days ago)
    const activeUsersThirtyDaysAgo = users.filter(u => {
      const created = new Date(u.created_at || now);
      return created <= thirtyDaysAgo && u.status === 'active';
    }).length;

    const churnRate = activeUsersThirtyDaysAgo > 0 
      ? Math.round((recentCancellations / activeUsersThirtyDaysAgo) * 100)
      : 0;

    // Calculate net MRR movement
    const upgradeMRR = this._calculateMRRDelta(activity.filter(a => a.type === 'upgrade' && new Date(a.timestamp) >= thirtyDaysAgo), true);
    const downgradeMRR = this._calculateMRRDelta(activity.filter(a => a.type === 'downgrade' && new Date(a.timestamp) >= thirtyDaysAgo), false);

    return {
      totalSubscribers: status.active.count,
      activeSubscriptions: status.active.count,
      cancelledSubscriptions: status.cancelled.count,
      pausedSubscriptions: status.paused.count,
      trialSubscriptions: status.trialing.count,
      metrics30Days: {
        upgrades: recentUpgrades,
        downgrades: recentDowngrades,
        cancellations: recentCancellations,
        reactivations: recentReactivations,
        netMovement: recentUpgrades - recentDowngrades - recentCancellations + recentReactivations
      },
      churnRate: churnRate,
      mrrMovement: {
        fromUpgrades: upgradeMRR,
        fromDowngrades: -downgradeMRR,
        net: upgradeMRR - downgradeMRR
      }
    };
  }

  /**
   * Calculate MRR delta for activities
   */
  static _calculateMRRDelta(activities, isUpgrade) {
    const getMonthlyPrice = (planKey) => {
      const plan = PlanManagementService.getPlan(planKey);
      if (!plan) return 0;
      const monthly = Number(plan.priceMonthly || 0);
      if (monthly > 0) return monthly;
      const yearly = Number(plan.priceYearly || 0);
      return yearly / 12;
    };

    return activities.reduce((total, activity) => {
      const fromValue = getMonthlyPrice(activity.fromPlan);
      const toValue = getMonthlyPrice(activity.toPlan);
      
      if (isUpgrade) {
        return total + (toValue - fromValue);
      } else {
        return total + (fromValue - toValue);
      }
    }, 0);
  }

  /**
   * Get subscription timeline events
   */
  static getTimelineEvents(limit = 50) {
    const activity = this.getSubscriptionActivity();
    return activity.slice(0, limit);
  }

  /**
   * Get retention cohort data
   */
  static getRetentionCohorts() {
    const users = this.getAllUsersWithSubscriptions();

    const cohorts = {};

    // Group users by signup month
    users.forEach(user => {
      if (!user.created_at) return;
      
      const createdDate = new Date(user.created_at);
      const cohortMonth = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!cohorts[cohortMonth]) {
        cohorts[cohortMonth] = {
          month: cohortMonth,
          signups: 0,
          active: 0,
          cancelled: 0,
          retentionRate: 0
        };
      }

      cohorts[cohortMonth].signups++;
      
      if (user.status === 'active') {
        cohorts[cohortMonth].active++;
      } else if (user.status === 'cancelled') {
        cohorts[cohortMonth].cancelled++;
      }
    });

    // Calculate retention rates
    Object.keys(cohorts).forEach(month => {
      const cohort = cohorts[month];
      if (cohort.signups > 0) {
        cohort.retentionRate = Math.round((cohort.active / cohort.signups) * 100);
      }
    });

    return Object.values(cohorts).sort((a, b) => b.month.localeCompare(a.month));
  }

  /**
   * Get MRR trend data
   */
  static getMRRTrend(months = 12) {
    const users = this.getAllUsersWithSubscriptions();
    const now = new Date();
    const getMonthlyPrice = (planKey) => {
      const plan = PlanManagementService.getPlan(planKey);
      if (!plan) return 0;
      const monthly = Number(plan.priceMonthly || 0);
      if (monthly > 0) return monthly;
      const yearly = Number(plan.priceYearly || 0);
      return yearly / 12;
    };

    const trend = [];

    for (let i = months - 1; i >= 0; i--) {
      const currentDate = new Date(now.getFullYear(), now.getMonth() - i);
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Calculate MRR for this month
      const monthlyMRR = users
        .filter(u => {
          if (!u.created_at) return false;
          const createdDate = new Date(u.created_at);
          return createdDate <= currentDate && u.status === 'active' && u.plan && u.plan !== 'free';
        })
        .reduce((sum, u) => {
          return sum + getMonthlyPrice(u.plan);
        }, 0);

      trend.push({
        month: month,
        mrr: monthlyMRR,
        date: currentDate
      });
    }

    return trend;
  }

  /**
   * Get churn analysis
   */
  static getChurnAnalysis() {
    const activity = this.getSubscriptionActivity();
    const cancellations = activity.filter(a => a.type === 'cancel');

    // Group by reason
    const reasonBreakdown = {};
    cancellations.forEach(c => {
      const reason = c.reason || 'Not specified';
      reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
    });

    // Group by plan
    const planBreakdown = {};
    cancellations.forEach(c => {
      const plan = c.fromPlan || 'unknown';
      planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
    });

    return {
      totalCancellations: cancellations.length,
      reasonBreakdown: reasonBreakdown,
      planBreakdown: planBreakdown,
      recentCancellations: cancellations.slice(0, 10)
    };
  }
}

export default SubscriptionService;
