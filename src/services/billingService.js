// billingService.js
// Simulated API for Billing (replace with real API integration as needed)

import { supabase } from "./supabaseClient";

export async function getBillingStats() {
  // Try to fetch from Supabase, fallback to mock if not configured or error
  try {
    // Example: fetch from a 'subscriptions' table
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('id, status, plan, amount, failed_payments')
      .neq('status', 'trial');
    if (error) throw error;
    if (!subs) throw new Error('No data');

    // Calculate stats from data
    const active = subs.filter(s => s.status === 'active').length;
    const cancelled = subs.filter(s => s.status === 'cancelled').length;
    const mrr = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.amount || 0), 0);
    const failedPayments = subs.reduce((sum, s) => sum + (s.failed_payments || 0), 0);
    const plans = {};
    subs.forEach(s => {
      if (!plans[s.plan]) plans[s.plan] = 0;
      plans[s.plan]++;
    });
    const planBreakdown = Object.entries(plans).map(([name, count]) => ({ name, count }));
    const churnRate = subs.length > 0 ? ((cancelled / subs.length) * 100).toFixed(2) : 0;

    return {
      mrr,
      churnRate,
      active,
      cancelled,
      failedPayments,
      planBreakdown
    };
  } catch (e) {
    // Fallback to mock data
    return {
      mrr: 12450,
      churnRate: 2.3,
      active: 320,
      cancelled: 18,
      failedPayments: 7,
      planBreakdown: [
        { name: "Starter", count: 120 },
        { name: "Pro", count: 150 },
        { name: "Enterprise", count: 50 }
      ]
    };
  }
}
