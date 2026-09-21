/**
 * Admin platform overview from ONE aggregate round trip.
 *
 * `public.admin_platform_metrics` (migration 20260921120000) returns every count,
 * sum and time series as a single jsonb payload, so the dashboard, analytics charts
 * and report tables all share one set of definitions:
 *
 *   Active business  organisation with a live subscription (active | valid trial | past_due in grace)
 *   Total users      auth.users — profiles may hold orphan rows
 *   Employees        memberships excluding owners and disabled members
 *   Paidly revenue   completed payment_history rows (customer invoice/POS money is never counted)
 *   MRR              paid MRR = live subscriptions that have actually been paid;
 *                    contracted MRR is reported separately so an unpaid book
 *                    cannot be read as earned revenue
 *
 * Buckets use Africa/Johannesburg. If the function is missing (migration not applied)
 * the caller falls back to the legacy per-query builder.
 */

import {
  ADMIN_TIMEZONE,
  buildSparkline,
  healthStatus,
  money,
  percentChange,
  resolvePeriodWindow,
} from "../../shared/admin/adminPlatformDirectory.js";
import {
  CUSTOMER_MONEY_UNAVAILABLE_REASON,
  PAGE_ANALYTICS_UNAVAILABLE_REASON,
  TRIAL_CONVERSION_UNAVAILABLE_REASON,
  adoptionRate,
  metricSource,
  planFamilyLabel,
} from "../../shared/admin/adminPlatformMetrics.js";

export const ADMIN_METRIC_DEFINITIONS = Object.freeze({
  totalUsers: "Signed-up accounts in auth.users. Profile rows without an account are excluded and reported under data integrity.",
  activeBusinesses: "Customer organisations with a live subscription: active, trialing before the end date, or past due inside grace.",
  totalBusinesses: "All customer organisations, excluding tenants flagged internal.",
  mrr: "Monthly-equivalent value of live subscriptions that have at least one completed payment.",
  contractedMrr: "Monthly-equivalent value of every live subscription, including those that have never been paid.",
  revenue: "Completed rows in payment_history for the selected period. Customer invoice and POS money belongs to the tenant.",
  employees: "Company memberships excluding owners and disabled members.",
  activeSubscriptions: "Subscriptions with status active.",
  trials: "Subscriptions with status trialing whose trial_ends_at is still in the future.",
});

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function usageBlock(raw) {
  const u = raw && typeof raw === "object" ? raw : {};
  if (u.unavailable) {
    return { total: null, period: null, previous: null, today: null, change: null, unavailable: true, unavailableReason: u.reason || null };
  }
  const period = num(u.period);
  const previous = num(u.previous);
  return {
    total: num(u.total),
    period,
    previous,
    today: num(u.today),
    change: percentChange(period, previous),
  };
}

function orgName(org) {
  return String(org?.name || org?.company_name || "Untitled business").trim();
}

/** Small row lists the aggregate cannot provide (feeds activity, attention, tables). */
async function loadRecentRows(supabase, window) {
  const [orgs, subs, failed, completed] = await Promise.all([
    supabase.from("organizations").select("id, name, created_at, is_internal").order("created_at", { ascending: false }).limit(8),
    supabase.from("subscriptions").select("id, status, company_id, plan, plan_slug, plan_family, amount, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("payment_history").select("id, company_id, amount, payment_status, created_at").eq("payment_status", "failed").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("payment_history")
      .select("id, company_id, amount, payment_status, payment_method, created_at")
      .eq("payment_status", "completed")
      .gte("created_at", window.from.toISOString())
      .lt("created_at", window.to.toISOString())
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  return {
    orgs: orgs.data || [],
    subs: subs.data || [],
    failed: failed.data || [],
    completed: completed.data || [],
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service-role client
 * @param {{ period?: string, seriesDays?: number, seriesMonths?: number }} [opts]
 * @returns {Promise<object|null>} null when the aggregate function is unavailable
 */
export async function buildAdminPlatformOverviewFromRpc(supabase, opts = {}) {
  const window = resolvePeriodWindow(opts.period);
  const seriesDays = Math.min(400, Math.max(7, Number(opts.seriesDays) || 30));
  const seriesMonths = Math.min(36, Math.max(3, Number(opts.seriesMonths) || 12));

  const { data: metrics, error } = await supabase.rpc("admin_platform_metrics", {
    p_from: window.from.toISOString(),
    p_to: window.to.toISOString(),
    p_prev_from: window.prevFrom.toISOString(),
    p_prev_to: window.prevTo.toISOString(),
    p_series_days: seriesDays,
    p_series_months: seriesMonths,
  });
  if (error || !metrics || typeof metrics !== "object") {
    if (error) console.warn("[admin-metrics] admin_platform_metrics unavailable:", error.message);
    return null;
  }

  const recent = await loadRecentRows(supabase, window);

  const businesses = metrics.businesses || {};
  const users = metrics.users || {};
  const subs = metrics.subscriptions || {};
  const payments = metrics.payments || {};
  const intents = metrics.payment_intents || {};
  const workforce = metrics.workforce || {};
  const pos = metrics.pos || {};
  const usage = metrics.usage || {};
  const integrity = metrics.profile_integrity || {};

  const invoices = usageBlock(usage.invoices);
  const quotes = usageBlock(usage.quotes);
  const payslips = usageBlock(usage.payslips);
  const posSales = usageBlock(usage.pos_sales);
  const recurring = usageBlock(usage.recurring_invoices);
  const leave = usageBlock(usage.leave_requests);
  const waitlist = usageBlock(usage.waitlist);

  const featureUsage = [invoices.period, quotes.period, payslips.period, posSales.period]
    .filter((n) => n != null)
    .reduce((sum, n) => sum + n, 0);
  const featureUsagePrev = [invoices.previous, quotes.previous, payslips.previous, posSales.previous]
    .filter((n) => n != null)
    .reduce((sum, n) => sum + n, 0);

  const revenuePeriod = money(payments.revenue_period);
  const revenuePrev = money(payments.revenue_previous);
  const paidMrr = money(subs.paid_mrr);
  const contractedMrr = money(subs.contracted_mrr);
  const activeBusinesses = num(businesses.active);
  const totalBusinesses = num(businesses.customer);
  const failedPayments = num(payments.failed_period) || 0;
  const pendingIntents = num(intents.pending);
  const failedIntents = num(intents.failed) || 0;
  const pastDue = num(subs.past_due) || 0;

  const daily = Array.isArray(metrics.series_daily) ? metrics.series_daily : [];
  const monthly = Array.isArray(metrics.series_monthly) ? metrics.series_monthly : [];

  const orgNames = new Map(recent.orgs.map((o) => [String(o.id), orgName(o)]));
  const attention = recent.failed.map((r) => ({
    id: `failed-${r.id}`,
    issue: "SaaS payment failed",
    entity: orgNames.get(String(r.company_id)) || "Business",
    amount: money(r.amount),
    severity: "critical",
    date: r.created_at,
    href: "/admin-v2/failed-payments",
    action: "Review",
  })).slice(0, 8);

  const activity = [
    ...recent.orgs.map((o) => ({
      id: `biz-${o.id}`,
      event: "Business registered",
      entity: orgName(o),
      date: o.created_at,
      href: "/admin-v2/businesses",
    })),
    ...recent.subs.map((s) => ({
      id: `subact-${s.id}`,
      event: `Subscription ${s.status}`,
      entity: planFamilyLabel(s.plan_family || s.plan_slug || s.plan),
      date: s.created_at,
      href: "/admin-v2/subscriptions",
    })),
    ...recent.failed.slice(0, 5).map((r) => ({
      id: `failact-${r.id}`,
      event: "Subscription payment failed",
      entity: orgNames.get(String(r.company_id)) || "Business",
      date: r.created_at,
      href: "/admin-v2/failed-payments",
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 10);

  // Data-integrity problems an admin can act on, alongside payment failures.
  const integrityAlerts = [];
  const liveUnpaid = num(subs.live_without_payment);
  if (liveUnpaid) {
    integrityAlerts.push({
      id: "integrity-live-unpaid",
      issue: `${liveUnpaid} live subscription${liveUnpaid === 1 ? "" : "s"} with no completed payment`,
      entity: "Billing",
      severity: "warning",
      href: "/admin-v2/subscriptions",
      action: "Review",
    });
  }
  const staleTrials = num(subs.trial_expired_unflipped);
  if (staleTrials) {
    integrityAlerts.push({
      id: "integrity-stale-trials",
      issue: `${staleTrials} trial${staleTrials === 1 ? "" : "s"} past the end date still marked trialing`,
      entity: "Subscriptions",
      severity: "warning",
      href: "/admin-v2/subscriptions",
      action: "Review",
    });
  }
  const orphanProfiles = num(integrity.orphans);
  if (orphanProfiles) {
    integrityAlerts.push({
      id: "integrity-orphan-profiles",
      issue: `${orphanProfiles} profile${orphanProfiles === 1 ? "" : "s"} without a sign-in account`,
      entity: "Accounts",
      severity: "info",
      href: "/admin-v2/users",
      action: "Review",
    });
  }

  const attentionCount = failedPayments + failedIntents + pastDue;
  const criticalCount = failedPayments > 5 || failedIntents > 3 ? 1 : 0;

  return {
    source: "rpc",
    period: window.period,
    compareLabel: window.compareLabel,
    timezone: ADMIN_TIMEZONE,
    generatedAt: metrics.generated_at || new Date().toISOString(),
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    kpis: {
      totalUsers: {
        value: num(users.total),
        change: percentChange(num(users.new), num(users.new_previous)),
        unavailable: Boolean(users.unavailable),
        unavailableReason: users.reason || null,
      },
      activeBusinesses: {
        value: activeBusinesses,
        change: percentChange(num(businesses.new), num(businesses.new_previous)),
        unavailable: Boolean(businesses.unavailable),
        unavailableReason: businesses.reason || null,
      },
      totalBusinesses: { value: totalBusinesses, unavailable: Boolean(businesses.unavailable) },
      mrr: {
        value: paidMrr,
        unavailable: Boolean(subs.unavailable),
        unavailableReason: subs.reason || null,
      },
      contractedMrr: {
        value: contractedMrr,
        unavailable: Boolean(subs.unavailable),
        note: num(subs.live_without_payment)
          ? `${num(subs.live_without_payment)} live subscription${num(subs.live_without_payment) === 1 ? "" : "s"} have no completed payment`
          : null,
      },
      activeSubscriptions: { value: num(subs.active), unavailable: Boolean(subs.unavailable) },
      platformUsage: {
        value: featureUsage,
        previous: featureUsagePrev,
        change: percentChange(featureUsage, featureUsagePrev),
      },
      paymentsProcessed: {
        value: num(payments.completed_period),
        previous: num(payments.completed_previous),
        change: percentChange(num(payments.completed_period), num(payments.completed_previous)),
        unavailable: Boolean(payments.unavailable),
        unavailableReason: payments.reason || null,
      },
      monthlyRevenue: {
        value: revenuePeriod,
        previous: revenuePrev,
        change: percentChange(revenuePeriod, revenuePrev),
        unavailable: Boolean(payments.unavailable),
      },
      employees: { value: num(workforce.employees), unavailable: Boolean(workforce.unavailable) },
    },
    revenue: {
      period: window.period,
      compareLabel: window.compareLabel,
      total: revenuePeriod,
      previous: revenuePrev,
      change: percentChange(revenuePeriod, revenuePrev),
      allTime: money(payments.revenue_all_time),
      sources: {
        subscription: {
          label: "Paidly subscription revenue",
          amount: revenuePeriod,
          previous: revenuePrev,
          change: percentChange(revenuePeriod, revenuePrev),
          source: "payment_history",
        },
        invoice: { label: "Customer invoice payments", amount: null, unavailable: true, unavailableReason: CUSTOMER_MONEY_UNAVAILABLE_REASON },
        pos: { label: "Customer POS sales", amount: null, unavailable: true, unavailableReason: CUSTOMER_MONEY_UNAVAILABLE_REASON },
        fees: { label: "Payment fees", amount: null, unavailable: true, unavailableReason: "Paidly does not store a platform fee ledger yet." },
      },
      sparkline: buildSparkline(daily.map((d) => money(d.revenue))),
    },
    usage: {
      invoices,
      quotes,
      payslips,
      recurring,
      leave,
      waitlist,
      pos: {
        ...posSales,
        enabledBusinesses: num(pos.businesses),
        connections: num(pos.connections),
        adoptionRate: adoptionRate(num(pos.businesses), totalBusinesses),
      },
      workforce: {
        employees: num(workforce.employees),
        members: num(workforce.members),
        owners: num(workforce.owners),
        companiesWithEmployees: num(workforce.companies_with_employees),
        payslips: payslips.total,
        leave: leave.total,
      },
      pageViews: { unavailable: true, unavailableReason: PAGE_ANALYTICS_UNAVAILABLE_REASON },
    },
    growth: {
      newUsers: num(users.new),
      newUsersPrevious: num(users.new_previous),
      newUsersChange: percentChange(num(users.new), num(users.new_previous)),
      newBusinesses: num(businesses.new),
      newBusinessesPrevious: num(businesses.new_previous),
      newBusinessesChange: percentChange(num(businesses.new), num(businesses.new_previous)),
      cancelled: num(subs.cancelled_in_period),
      subscriptionsStarted: num(subs.created_in_period),
      trialConversion: null,
      trialConversionUnavailable: true,
      trialConversionReason: TRIAL_CONVERSION_UNAVAILABLE_REASON,
    },
    subscriptions: {
      active: num(subs.active),
      trial: num(subs.trialing),
      expired: num(subs.expired),
      cancelled: num(subs.cancelled),
      pastDue: num(subs.past_due),
      live: num(subs.live),
      adminGranted: num(subs.admin_granted),
      total: num(subs.total),
      unavailable: Boolean(subs.unavailable),
      unavailableReason: subs.reason || null,
    },
    planMix: Array.isArray(metrics.plan_mix)
      ? metrics.plan_mix.map((row) => ({
          family: row.family,
          label: planFamilyLabel(row.family),
          live: num(row.live),
          mrr: money(row.mrr),
        }))
      : [],
    series: {
      timezone: ADMIN_TIMEZONE,
      daily: daily.map((d) => ({
        day: d.day,
        newUsers: num(d.new_users) || 0,
        newBusinesses: num(d.new_businesses) || 0,
        invoices: num(d.invoices) || 0,
        quotes: num(d.quotes) || 0,
        revenue: money(d.revenue),
      })),
      monthly: monthly.map((m) => ({
        month: m.month,
        newUsers: num(m.new_users) || 0,
        newBusinesses: num(m.new_businesses) || 0,
        subscriptionsStarted: num(m.subscriptions_started) || 0,
        subscriptionsCancelled: num(m.subscriptions_cancelled) || 0,
        payments: num(m.payments) || 0,
        revenue: money(m.revenue),
      })),
      history: metrics.history || {},
    },
    health: {
      status: healthStatus({ critical: criticalCount, attention: attentionCount }),
      activeBusinesses,
      businessesOnTrial: num(subs.trialing),
      businessesAtRisk: pastDue,
      failedPayments,
      pendingPaymentIntents: pendingIntents,
      waitlist: waitlist.total,
      sources: { failedPayments: null, paymentIntents: intents.unavailable ? intents.reason : null },
    },
    integrity: {
      profileOrphans: num(integrity.orphans),
      profiles: num(integrity.profiles),
      liveSubscriptionsWithoutPayment: num(subs.live_without_payment),
      trialsPastEndStillTrialing: num(subs.trial_expired_unflipped),
      businessesWithoutSubscription: num(businesses.without_subscription),
    },
    attention: [...attention, ...integrityAlerts].slice(0, 10),
    activity,
    recentBusinesses: recent.orgs.map((o) => {
      const sub = recent.subs.find((s) => String(s.company_id) === String(o.id));
      return {
        id: o.id,
        business: orgName(o),
        plan: planFamilyLabel(sub?.plan_family || sub?.plan_slug || sub?.plan),
        status: sub?.status || "none",
        extra: o.is_internal ? "Internal" : null,
        date: o.created_at,
      };
    }),
    recentTransactions: recent.completed.map((r) => ({
      id: r.id,
      title: "Subscription payment",
      type: "subscription",
      business: orgNames.get(String(r.company_id)) || "—",
      amount: money(r.amount),
      status: r.payment_status,
      extra: r.payment_method || "PayFast",
      date: r.created_at,
    })),
    definitions: ADMIN_METRIC_DEFINITIONS,
    metricSources: {
      totalUsers: metricSource("auth.users", "exact count of signed-up accounts"),
      activeBusinesses: metricSource("organizations + subscriptions", "customer orgs with a live subscription"),
      mrr: metricSource("subscriptions + payment_history", "monthly-equivalent of live subs that have been paid"),
      contractedMrr: metricSource("subscriptions", "monthly-equivalent of all live subs"),
      activeSubscriptions: metricSource("subscriptions", "exact count status=active"),
      trial: metricSource("subscriptions", "status=trialing and trial_ends_at in the future"),
      employees: metricSource("memberships", "excludes owners and disabled members"),
      paidlyRevenue: metricSource("payment_history", "sum of completed rows in the selected period"),
      invoicesCreated: metricSource("invoices", "created_at in period (Africa/Johannesburg)"),
      quotesCreated: metricSource("quotes", "created_at in period (Africa/Johannesburg)"),
      posUsage: metricSource("pos_sales_events", "occurred_at in period (Africa/Johannesburg)"),
    },
  };
}
