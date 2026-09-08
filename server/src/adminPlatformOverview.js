/**
 * Platform-level Admin overview.
 * Paidly revenue = payment_history. Usage = exact counts from source tables.
 * Does not use the caller’s organization_id.
 */

import {
  addUtcDays,
  buildSparkline,
  countExact,
  healthStatus,
  isIntegerBindError,
  isMissingRelationError,
  logIntegerBindError,
  money,
  percentChange,
  resolvePeriodWindow,
  startOfUtcDay,
  sumField,
} from "../../shared/admin/adminPlatformDirectory.js";
import {
  CUSTOMER_MONEY_UNAVAILABLE_REASON,
  PAGE_ANALYTICS_UNAVAILABLE_REASON,
  TRIAL_CONVERSION_UNAVAILABLE_REASON,
  adoptionRate,
  metricSource,
  planFamilyLabel,
} from "../../shared/admin/adminPlatformMetrics.js";
import {
  buildBillingReporting,
  buildRevenueMetrics,
  buildSubscriptionOverview,
} from "./billing/adminBillingApi.js";

async function queryTable(supabase, table, build) {
  try {
    const result = await build(supabase.from(table));
    if (result.error) {
      if (isIntegerBindError(result.error)) {
        logIntegerBindError("admin-overview", {
          table,
          operation: "select",
          message: result.error.message,
        });
      }
      if (isMissingRelationError(result.error)) {
        return { data: [], count: 0, unavailable: true, reason: `${table} is not available in this environment.` };
      }
      return { data: [], count: 0, unavailable: true, reason: result.error.message || `Failed to read ${table}` };
    }
    return {
      data: result.data || [],
      count: typeof result.count === "number" ? result.count : (result.data || []).length,
      unavailable: false,
      reason: null,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { data: [], count: 0, unavailable: true, reason: `${table} is not available in this environment.` };
    }
    return { data: [], count: 0, unavailable: true, reason: error?.message || `Failed to read ${table}` };
  }
}

async function countTable(supabase, table, apply = (q) => q) {
  return queryTable(supabase, table, (q) => apply(q.select("id", { count: "exact", head: true })));
}

async function countInRange(supabase, table, column, from, to, apply = (q) => q) {
  return countTable(supabase, table, (q) => {
    let next = apply(q).gte(column, from.toISOString());
    if (to) next = next.lt(column, to.toISOString());
    return next;
  });
}

async function countCustomerOrgs(supabase) {
  const filtered = await queryTable(supabase, "organizations", (q) =>
    q.select("id", { count: "exact", head: true }).eq("is_internal", false)
  );
  if (filtered.unavailable) return countTable(supabase, "organizations");
  return filtered;
}

async function safeBilling(fn) {
  try {
    return { data: await fn(), unavailable: false, reason: null };
  } catch (error) {
    return { data: null, unavailable: true, reason: error?.message || "Billing source unavailable" };
  }
}

function orgName(org) {
  return String(org?.name || org?.company_name || "Untitled business").trim();
}

export async function buildAdminPlatformOverview(supabase, opts = {}) {
  const window = resolvePeriodWindow(opts.period);
  const now = new Date();
  const today = startOfUtcDay(now);
  const sparkFrom = addUtcDays(today, -6);

  const [
    customerOrgs,
    newOrgs,
    newOrgsPrev,
    profiles,
    newUsers,
    newUsersPrev,
    waitlist,
    invoicesTotal,
    invoicesPeriod,
    invoicesPrev,
    invoicesToday,
    quotesTotal,
    quotesPeriod,
    quotesPrev,
    quotesToday,
    payslipsTotal,
    payslipsPeriod,
    posPeriod,
    posToday,
    posEnabled,
    posConnections,
    recurringPeriod,
    members,
    payroll,
    leave,
    attendance,
    saasCompletedPeriod,
    saasCompletedPrev,
    saasFailedPeriod,
    saasRefundedPeriod,
    saasFailedRecent,
    intentsPending,
    intentsFailed,
    cancelledPeriod,
    orgRows,
    subRows,
    sparkRows,
    billingOverview,
    billingReporting,
    revenueMetrics,
  ] = await Promise.all([
    countCustomerOrgs(supabase),
    countInRange(supabase, "organizations", "created_at", window.from, window.to),
    countInRange(supabase, "organizations", "created_at", window.prevFrom, window.prevTo),
    countTable(supabase, "profiles"),
    countInRange(supabase, "profiles", "created_at", window.from, window.to),
    countInRange(supabase, "profiles", "created_at", window.prevFrom, window.prevTo),
    countTable(supabase, "waitlist_signups"),
    countTable(supabase, "invoices"),
    countInRange(supabase, "invoices", "created_at", window.from, window.to),
    countInRange(supabase, "invoices", "created_at", window.prevFrom, window.prevTo),
    countInRange(supabase, "invoices", "created_at", today, null),
    countTable(supabase, "quotes"),
    countInRange(supabase, "quotes", "created_at", window.from, window.to),
    countInRange(supabase, "quotes", "created_at", window.prevFrom, window.prevTo),
    countInRange(supabase, "quotes", "created_at", today, null),
    countTable(supabase, "payslips"),
    countInRange(supabase, "payslips", "created_at", window.from, window.to),
    countInRange(supabase, "pos_sales_events", "occurred_at", window.from, window.to),
    countInRange(supabase, "pos_sales_events", "occurred_at", today, null),
    countTable(supabase, "organizations", (q) => q.in("business_type", ["retail", "mixed"])),
    countTable(supabase, "pos_connections"),
    countInRange(supabase, "recurring_invoices", "created_at", window.from, window.to),
    countTable(supabase, "memberships"),
    countTable(supabase, "payroll_profiles"),
    countTable(supabase, "leave_requests"),
    countTable(supabase, "attendance_profiles"),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, payment_status, payment_method, created_at")
        .eq("payment_status", "completed")
        .gte("created_at", window.from.toISOString())
        .lt("created_at", window.to.toISOString())
        .limit(5000)
    ),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, amount, created_at")
        .eq("payment_status", "completed")
        .gte("created_at", window.prevFrom.toISOString())
        .lt("created_at", window.prevTo.toISOString())
        .limit(5000)
    ),
    countInRange(supabase, "payment_history", "created_at", window.from, window.to, (q) => q.eq("payment_status", "failed")),
    countInRange(supabase, "payment_history", "created_at", window.from, window.to, (q) => q.eq("payment_status", "refunded")),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, payment_status, created_at").eq("payment_status", "failed").order("created_at", { ascending: false }).limit(20)
    ),
    countTable(supabase, "payment_intents", (q) => q.in("status", ["pending", "requires_action", "processing"])),
    countTable(supabase, "payment_intents", (q) => q.eq("status", "failed")),
    countInRange(supabase, "subscriptions", "cancelled_at", window.from, window.to),
    queryTable(supabase, "organizations", (q) =>
      q.select("id, name, created_at, is_internal").order("created_at", { ascending: false }).limit(8)
    ),
    queryTable(supabase, "subscriptions", (q) =>
      q.select("id, status, company_id, plan, plan_slug, plan_family, amount, created_at").order("created_at", { ascending: false }).limit(8)
    ),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, amount, created_at")
        .eq("payment_status", "completed")
        .gte("created_at", sparkFrom.toISOString())
        .limit(5000)
    ),
    safeBilling(() => buildSubscriptionOverview(supabase)),
    safeBilling(() => buildBillingReporting(supabase, now)),
    safeBilling(() => buildRevenueMetrics(supabase)),
  ]);

  let recentOrgs = orgRows;
  if (orgRows.unavailable) {
    recentOrgs = await queryTable(supabase, "organizations", (q) =>
      q.select("id, name, created_at").order("created_at", { ascending: false }).limit(8)
    );
  }

  const billing = billingOverview.data || {};
  const reporting = billingReporting.data || {};
  const saas = revenueMetrics.data || {};

  const activeBusinesses = countExact(customerOrgs);
  const platformUsers = countExact(profiles);
  const invoicePeriodCount = countExact(invoicesPeriod);
  const quotePeriodCount = countExact(quotesPeriod);
  const payslipPeriodCount = countExact(payslipsPeriod);
  const posPeriodCount = countExact(posPeriod);
  const platformUsage = [invoicePeriodCount, quotePeriodCount, payslipPeriodCount, posPeriodCount]
    .filter((n) => n != null)
    .reduce((sum, n) => sum + n, 0);
  const platformUsagePrev = [countExact(invoicesPrev), countExact(quotesPrev)]
    .filter((n) => n != null)
    .reduce((sum, n) => sum + n, 0);

  const paidlyRevenue = money(sumField(saasCompletedPeriod.data, "amount"));
  const paidlyRevenuePrev = money(sumField(saasCompletedPrev.data, "amount"));
  const mrr = saas.mrr == null ? null : money(saas.mrr);
  const activeSubs = billing.active ?? reporting.activeSubscribers ?? null;
  const trialSubs = reporting.trialUsers ?? billing.trial ?? null;
  const expiredSubs = reporting.expiredTrials ?? billing.expired ?? null;
  const cancelledSubs = billing.cancelled ?? null;
  const failedPayments = countExact(saasFailedPeriod);
  const pendingIntents = countExact(intentsPending);
  const failedIntents = countExact(intentsFailed);
  const posEnabledCount = countExact(posEnabled);
  const posAdoption = adoptionRate(posEnabledCount, activeBusinesses);

  const attentionCount = (failedPayments || 0) + (failedIntents || 0) + (billing.pastDue || 0);
  const criticalCount = (failedPayments || 0) > 5 || (failedIntents || 0) > 3 ? 1 : 0;

  const orgNames = new Map((recentOrgs.data || []).map((o) => [String(o.id), orgName(o)]));
  for (const row of saasFailedRecent.data || []) {
    if (row.company_id && !orgNames.has(String(row.company_id))) {
      orgNames.set(String(row.company_id), "Business");
    }
  }

  const attention = [
    ...(saasFailedRecent.data || []).map((r) => ({
      id: `failed-${r.id}`,
      issue: "SaaS payment failed",
      entity: orgNames.get(String(r.company_id)) || "Business",
      amount: money(r.amount),
      severity: "critical",
      date: r.created_at,
      href: "/admin-v2/failed-payments",
      action: "Review",
    })),
  ].slice(0, 8);

  const activity = [
    ...(recentOrgs.data || []).map((o) => ({
      id: `biz-${o.id}`,
      event: "Business registered",
      entity: orgName(o),
      date: o.created_at,
      href: "/admin-v2/businesses",
    })),
    ...(subRows.data || []).map((s) => ({
      id: `subact-${s.id}`,
      event: `Subscription ${s.status}`,
      entity: planFamilyLabel(s.plan_family || s.plan_slug || s.plan),
      date: s.created_at,
      href: "/admin-v2/subscriptions",
    })),
    ...(saasFailedRecent.data || []).slice(0, 5).map((r) => ({
      id: `failact-${r.id}`,
      event: "Subscription payment failed",
      entity: orgNames.get(String(r.company_id)) || "Business",
      date: r.created_at,
      href: "/admin-v2/failed-payments",
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 10);

  const recentBusinesses = (recentOrgs.data || []).map((o) => {
    const sub = (subRows.data || []).find((s) => String(s.company_id) === String(o.id));
    return {
      id: o.id,
      business: orgName(o),
      plan: planFamilyLabel(sub?.plan_family || sub?.plan_slug || sub?.plan),
      status: sub?.status || "none",
      extra: o.is_internal ? "Internal" : null,
      date: o.created_at,
    };
  });

  const recentTransactions = (saasCompletedPeriod.data || [])
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      title: "Subscription payment",
      type: "subscription",
      business: orgNames.get(String(r.company_id)) || "—",
      amount: money(r.amount),
      status: r.payment_status,
      extra: r.payment_method || "PayFast",
      date: r.created_at,
    }));

  const sparkDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayFrom = addUtcDays(today, -i);
    const dayTo = addUtcDays(dayFrom, 1);
    const dayAmount = money(
      (sparkRows.data || [])
        .filter((row) => {
          const t = new Date(row.created_at).getTime();
          return t >= dayFrom.getTime() && t < dayTo.getTime();
        })
        .reduce((sum, row) => sum + money(row.amount), 0)
    );
    sparkDays.push(dayAmount);
  }

  const docsUnavailable = invoicesPeriod.unavailable && quotesPeriod.unavailable && payslipsPeriod.unavailable;

  return {
    period: window.period,
    compareLabel: window.compareLabel,
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    },
    kpis: {
      totalUsers: {
        value: platformUsers,
        previous: null,
        change: percentChange(countExact(newUsers), countExact(newUsersPrev)),
        unavailable: profiles.unavailable,
        unavailableReason: profiles.reason,
      },
      activeBusinesses: {
        value: activeBusinesses,
        previous: countExact(newOrgsPrev),
        change: percentChange(countExact(newOrgs), countExact(newOrgsPrev)),
        unavailable: customerOrgs.unavailable,
        unavailableReason: customerOrgs.reason,
      },
      mrr: {
        value: mrr,
        previous: null,
        change: null,
        unavailable: revenueMetrics.unavailable,
        unavailableReason: revenueMetrics.reason,
      },
      activeSubscriptions: {
        value: activeSubs,
        previous: null,
        change: null,
        unavailable: billingOverview.unavailable && billingReporting.unavailable,
        unavailableReason: billingOverview.reason || billingReporting.reason,
      },
      platformUsage: {
        value: docsUnavailable ? null : platformUsage,
        previous: platformUsagePrev,
        change: percentChange(platformUsage, platformUsagePrev),
        unavailable: docsUnavailable,
        unavailableReason: invoicesPeriod.reason,
      },
      monthlyRevenue: {
        value: paidlyRevenue,
        previous: paidlyRevenuePrev,
        change: percentChange(paidlyRevenue, paidlyRevenuePrev),
        unavailable: Boolean(saasCompletedPeriod.unavailable),
        unavailableReason: saasCompletedPeriod.reason,
      },
      documentsProcessed: {
        value: docsUnavailable ? null : platformUsage,
        previous: platformUsagePrev,
        change: percentChange(platformUsage, platformUsagePrev),
        unavailable: docsUnavailable,
        unavailableReason: invoicesPeriod.reason,
      },
      paymentsProcessed: {
        value: saasCompletedPeriod.unavailable ? null : (saasCompletedPeriod.data || []).length,
        previous: saasCompletedPrev.unavailable ? null : (saasCompletedPrev.data || []).length,
        change: percentChange((saasCompletedPeriod.data || []).length, (saasCompletedPrev.data || []).length),
        unavailable: Boolean(saasCompletedPeriod.unavailable),
        unavailableReason: saasCompletedPeriod.reason,
      },
      platformUsers: {
        value: platformUsers,
        previous: null,
        change: null,
        unavailable: profiles.unavailable,
        unavailableReason: profiles.reason,
      },
    },
    revenue: {
      period: window.period,
      compareLabel: window.compareLabel,
      sources: {
        subscription: {
          label: "Paidly subscription revenue",
          amount: paidlyRevenue,
          previous: paidlyRevenuePrev,
          change: percentChange(paidlyRevenue, paidlyRevenuePrev),
          source: "payment_history",
        },
        invoice: {
          label: "Customer invoice payments",
          amount: null,
          unavailable: true,
          unavailableReason: CUSTOMER_MONEY_UNAVAILABLE_REASON,
          source: "payments",
        },
        pos: {
          label: "Customer POS sales",
          amount: null,
          unavailable: true,
          unavailableReason: CUSTOMER_MONEY_UNAVAILABLE_REASON,
          source: "pos_sales_events",
        },
        fees: {
          label: "Payment fees",
          amount: null,
          unavailable: true,
          unavailableReason: "Paidly does not store a platform fee ledger yet.",
        },
        other: {
          label: "Other Paidly revenue",
          amount: 0,
          unavailable: false,
        },
      },
      total: paidlyRevenue,
      sparkline: buildSparkline(sparkDays),
    },
    usage: {
      invoices: {
        total: countExact(invoicesTotal),
        period: invoicePeriodCount,
        previous: countExact(invoicesPrev),
        today: countExact(invoicesToday),
        change: percentChange(invoicePeriodCount, countExact(invoicesPrev)),
      },
      quotes: {
        total: countExact(quotesTotal),
        period: quotePeriodCount,
        previous: countExact(quotesPrev),
        today: countExact(quotesToday),
        change: percentChange(quotePeriodCount, countExact(quotesPrev)),
      },
      pos: {
        period: posPeriodCount,
        today: countExact(posToday),
        enabledBusinesses: posEnabledCount,
        connections: countExact(posConnections),
        adoptionRate: posAdoption,
      },
      payslips: {
        total: countExact(payslipsTotal),
        period: payslipPeriodCount,
      },
      recurring: {
        period: countExact(recurringPeriod),
      },
      workforce: {
        employees: countExact(members),
        payroll: countExact(payroll),
        leave: countExact(leave),
        attendance: countExact(attendance),
        payslips: countExact(payslipsTotal),
      },
      pageViews: {
        unavailable: true,
        unavailableReason: PAGE_ANALYTICS_UNAVAILABLE_REASON,
      },
    },
    growth: {
      newUsers: countExact(newUsers),
      newUsersPrevious: countExact(newUsersPrev),
      newUsersChange: percentChange(countExact(newUsers), countExact(newUsersPrev)),
      newBusinesses: countExact(newOrgs),
      newBusinessesPrevious: countExact(newOrgsPrev),
      newBusinessesChange: percentChange(countExact(newOrgs), countExact(newOrgsPrev)),
      trialConversion: null,
      trialConversionUnavailable: true,
      trialConversionReason: TRIAL_CONVERSION_UNAVAILABLE_REASON,
      cancelled: countExact(cancelledPeriod),
    },
    subscriptions: {
      active: activeSubs,
      trial: trialSubs,
      expired: expiredSubs,
      cancelled: cancelledSubs,
      pastDue: billing.pastDue ?? null,
      unavailable: billingOverview.unavailable && billingReporting.unavailable,
      unavailableReason: billingOverview.reason || billingReporting.reason,
    },
    health: {
      status: healthStatus({ critical: criticalCount, attention: attentionCount }),
      activeBusinesses,
      businessesOnTrial: trialSubs,
      businessesAtRisk: billing.pastDue ?? null,
      failedPayments,
      pendingPaymentIntents: pendingIntents,
      waitlist: countExact(waitlist),
      sources: {
        failedPayments: saasFailedRecent.unavailable ? saasFailedRecent.reason : null,
        paymentIntents: intentsPending.unavailable ? intentsPending.reason : null,
      },
    },
    attention,
    activity,
    recentBusinesses,
    recentTransactions,
    reports: {
      documents: {
        invoices: countExact(invoicesTotal),
        quotes: countExact(quotesTotal),
        payslips: countExact(payslipsTotal),
        invoicesPeriod: invoicePeriodCount,
        quotesPeriod: quotePeriodCount,
        posPeriod: posPeriodCount,
      },
      workforce: {
        employees: countExact(members),
        payroll: countExact(payroll),
        leave: countExact(leave),
        attendance: countExact(attendance),
        payslips: countExact(payslipsTotal),
      },
      refunds: {
        period: countExact(saasRefundedPeriod),
      },
    },
    metricSources: {
      totalUsers: metricSource("profiles", "exact count of profiles"),
      activeBusinesses: metricSource("organizations", "exact count where is_internal is false"),
      mrr: metricSource("subscriptions", "active rows × monthly-normalized amount (buildRevenueMetrics)"),
      activeSubscriptions: metricSource("subscriptions", "exact count status=active"),
      trial: metricSource("subscriptions", "status in (trialing, trial) and trial_ends_at is null or future"),
      expired: metricSource("subscriptions", "status=expired plus overdue trials without admin_override"),
      paidlyRevenue: metricSource("payment_history", "sum of completed rows in the selected period"),
      invoicesCreated: metricSource("invoices", "exact count created_at in period"),
      quotesCreated: metricSource("quotes", "exact count created_at in period"),
      posUsage: metricSource("pos_sales_events", "exact count occurred_at in period"),
    },
  };
}
