import { describe, expect, it } from "vitest";
import { buildAdminPlatformOverviewFromRpc } from "../../server/src/adminPlatformMetrics.js";
import {
  startOfBusinessDay,
  startOfBusinessMonth,
  resolvePeriodWindow,
} from "@shared/admin/adminPlatformDirectory.js";
import { ADMIN_NAV_GROUPS, flattenAdminNavItems } from "@/lib/adminNavConfig.js";

/** Aggregate payload shaped like public.admin_platform_metrics. */
const METRICS = {
  businesses: { total: 47, customer: 46, internal: 1, active: 5, without_subscription: 42, new: 1, new_previous: 2 },
  users: { total: 37, new: 2, new_previous: 2, confirmed: 30 },
  profile_integrity: { profiles: 41, orphans: 4 },
  workforce: { members: 49, employees: 12, owners: 37, companies_with_employees: 6 },
  subscriptions: {
    total: 53, active: 28, trialing: 0, trial_expired_unflipped: 3, past_due: 0, cancelled: 23,
    expired: 0, pending: 2, live: 28, admin_granted: 4, cancelled_in_period: 2, created_in_period: 1,
    contracted_mrr: 1464.17, paid_mrr: 0, live_without_payment: 28,
  },
  payments: {
    total_rows: 0, completed_period: 0, completed_previous: 0, revenue_period: 0,
    revenue_previous: 0, revenue_all_time: 0, failed_period: 0, refunded_period: 0,
  },
  payment_intents: { pending: 1, failed: 0 },
  pos: { connections: 2, businesses: 1 },
  usage: {
    invoices: { total: 23, period: 3, previous: 1, today: 0 },
    quotes: { total: 2, period: 0, previous: 0, today: 0 },
    payslips: { total: 1, period: 0, previous: 0, today: 0 },
    pos_sales: { total: 10, period: 3, previous: 0, today: 0 },
    recurring_invoices: { total: 0, period: 0, previous: 0, today: 0 },
    leave_requests: { total: 0, period: 0, previous: 0, today: 0 },
    waitlist: { total: 6, period: 0, previous: 0, today: 0 },
    pay_runs: { unavailable: true, reason: "pay_runs is not available in this environment." },
  },
  plan_mix: [{ family: "business", live: 20, mrr: 1200 }],
  series_daily: [
    { day: "2026-09-20", new_users: 1, new_businesses: 0, invoices: 2, quotes: 0, revenue: 0 },
    { day: "2026-09-21", new_users: 0, new_businesses: 1, invoices: 1, quotes: 0, revenue: 0 },
  ],
  series_monthly: [
    { month: "2026-09", new_users: 2, new_businesses: 1, subscriptions_started: 1, subscriptions_cancelled: 2, payments: 0, revenue: 0 },
  ],
  history: { first_business_at: "2026-01-04T08:00:00Z", first_user_at: "2026-01-04T08:00:00Z", first_payment_at: null },
  generated_at: "2026-09-21T10:00:00Z",
};

function fakeSupabase({ rpcError = null, metrics = METRICS } = {}) {
  const table = () => {
    const chain = {};
    for (const k of ["select", "eq", "gte", "lt", "order", "in"]) chain[k] = () => chain;
    chain.limit = async () => ({ data: [], error: null });
    return chain;
  };
  return {
    rpc: async (name, args) => {
      fakeSupabase.lastCall = { name, args };
      return rpcError ? { data: null, error: rpcError } : { data: metrics, error: null };
    },
    from: table,
  };
}

describe("admin overview from the aggregate function", () => {
  it("uses agreed definitions: auth users, live-subscription businesses, employees without owners", async () => {
    const out = await buildAdminPlatformOverviewFromRpc(fakeSupabase(), { period: "monthly" });
    expect(out.kpis.totalUsers.value).toBe(37); // auth.users, not the 41 profiles
    expect(out.integrity.profileOrphans).toBe(4);
    expect(out.kpis.activeBusinesses.value).toBe(5); // live subscription, not all 46 orgs
    expect(out.kpis.totalBusinesses.value).toBe(46);
    expect(out.usage.workforce.employees).toBe(12); // 49 memberships − 37 owners
  });

  it("separates paid MRR from contracted MRR so unpaid subscriptions are not revenue", async () => {
    const out = await buildAdminPlatformOverviewFromRpc(fakeSupabase(), { period: "monthly" });
    expect(out.kpis.mrr.value).toBe(0);
    expect(out.kpis.contractedMrr.value).toBe(1464.17);
    expect(out.kpis.contractedMrr.note).toMatch(/28 live subscriptions have no completed payment/);
    expect(out.revenue.total).toBe(0);
  });

  it("raises data-integrity issues as admin actions", async () => {
    const out = await buildAdminPlatformOverviewFromRpc(fakeSupabase(), { period: "monthly" });
    const ids = out.attention.map((a) => a.id);
    expect(ids).toContain("integrity-live-unpaid");
    expect(ids).toContain("integrity-stale-trials");
    expect(ids).toContain("integrity-orphan-profiles");
  });

  it("exposes chart series and marks unavailable sources instead of reporting zero", async () => {
    const out = await buildAdminPlatformOverviewFromRpc(fakeSupabase(), { period: "monthly" });
    expect(out.series.daily).toHaveLength(2);
    expect(out.series.daily[0]).toMatchObject({ day: "2026-09-20", newUsers: 1, invoices: 2 });
    expect(out.series.monthly[0]).toMatchObject({ month: "2026-09", subscriptionsCancelled: 2 });
    expect(out.series.history.first_payment_at).toBeNull();
    expect(out.usage.invoices.change).toBe(200); // 3 vs 1
    expect(out.planMix[0]).toMatchObject({ family: "business", live: 20 });
  });

  it("passes the requested window and series length to the database", async () => {
    await buildAdminPlatformOverviewFromRpc(fakeSupabase(), { period: "weekly", seriesDays: 90 });
    expect(fakeSupabase.lastCall.name).toBe("admin_platform_metrics");
    expect(fakeSupabase.lastCall.args.p_series_days).toBe(90);
    expect(new Date(fakeSupabase.lastCall.args.p_from).getTime()).toBeLessThan(
      new Date(fakeSupabase.lastCall.args.p_to).getTime()
    );
  });

  it("returns null when the aggregate function is missing, so the caller can fall back", async () => {
    const out = await buildAdminPlatformOverviewFromRpc(
      fakeSupabase({ rpcError: { message: "function public.admin_platform_metrics does not exist" } }),
      {}
    );
    expect(out).toBeNull();
  });
});

describe("admin date boundaries use Africa/Johannesburg", () => {
  it("treats 00:30 SAST as the new day, not the previous UTC day", () => {
    // 2026-09-21T00:30+02:00 === 2026-09-20T22:30Z
    const at = new Date("2026-09-20T22:30:00Z");
    expect(startOfBusinessDay(at).toISOString()).toBe("2026-09-20T22:00:00.000Z");
    expect(startOfBusinessMonth(at).toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("anchors period windows to SAST midnight", () => {
    const w = resolvePeriodWindow("daily", new Date("2026-09-20T22:30:00Z"));
    expect(w.from.toISOString()).toBe("2026-09-20T22:00:00.000Z");
  });

  it("derives the previous window from the SAST calendar, not the shifted timestamp", () => {
    const monthly = resolvePeriodWindow("monthly", new Date("2026-09-08T12:00:00Z"));
    expect(monthly.from.toISOString()).toBe("2026-08-31T22:00:00.000Z"); // 1 Sep SAST
    expect(monthly.prevFrom.toISOString()).toBe("2026-07-31T22:00:00.000Z"); // 1 Aug SAST
    const yearly = resolvePeriodWindow("yearly", new Date("2026-09-08T12:00:00Z"));
    expect(yearly.from.toISOString()).toBe("2025-12-31T22:00:00.000Z"); // 1 Jan 2026 SAST
    expect(yearly.prevFrom.toISOString()).toBe("2024-12-31T22:00:00.000Z"); // 1 Jan 2025 SAST
  });
});

describe("admin navigation after cleanup", () => {
  const paths = flattenAdminNavItems().map((i) => i.path);

  it("drops the duplicated report pages, activity and automations entries", () => {
    for (const gone of [
      "/admin-v2/reports/business",
      "/admin-v2/reports/revenue",
      "/admin-v2/reports/documents",
      "/admin-v2/reports/workforce",
      "/admin-v2/reports/platform",
      "/admin-v2/activity",
      "/admin-v2/automations",
      "/admin-v2/attendance",
    ]) {
      expect(paths).not.toContain(gone);
    }
  });

  it("keeps one analytics entry and no duplicate paths", () => {
    expect(paths.filter((p) => p === "/admin-v2/analytics")).toHaveLength(1);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps the operational sections", () => {
    const groups = ADMIN_NAV_GROUPS.map((g) => g.id);
    expect(groups).toEqual(expect.arrayContaining(["overview", "business", "documents", "workforce", "financial", "platform", "administration"]));
    expect(paths).toEqual(expect.arrayContaining(["/admin-v2", "/admin-v2/businesses", "/admin-v2/subscriptions", "/admin-v2/system-health", "/admin-v2/audit-log"]));
  });
});
