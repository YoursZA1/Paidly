/**
 * Raw PostgREST reads behind the dashboard / cash-flow read models must be pinned to the active business.
 * RLS returns every org the user may read; a user who owns Business B and works at Company A would
 * otherwise see both companies' revenue summed on one dashboard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "b0000000-0000-4000-8000-000000000001";
const OWNED_ORG = "b0000000-0000-4000-8000-0000000000bb";
const EMPLOYER_ORG = "a0000000-0000-4000-8000-0000000000aa";

const state = { sessionUser: USER, ownedOrg: OWNED_ORG, memberOrg: EMPLOYER_ORG, calls: [] };

function builder(table) {
  const call = { table, filters: {} };
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    range: () => b,
    gte: () => b,
    eq: (col, val) => {
      call.filters[col] = val;
      return b;
    },
    maybeSingle: async () => {
      if (table === "organizations") return { data: state.ownedOrg ? { id: state.ownedOrg } : null, error: null };
      if (table === "memberships") return { data: state.memberOrg ? { org_id: state.memberOrg } : null, error: null };
      return { data: null, error: null };
    },
    then: (resolve) => {
      state.calls.push(call);
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { from: (t) => builder(t) },
}));
vi.mock("@/api/auth/authSessionHelpers.js", () => ({
  getSessionWithRetry: async () => ({ data: { session: state.sessionUser ? { user: { id: state.sessionUser } } : null } }),
}));
vi.mock("@/lib/orgBootstrapApi", () => ({ clearOrgBootstrapInflight: () => {} }));
vi.mock("@/api/entities", () => ({ Expense: {}, Invoice: {}, Payment: {} }));

const { clearOrgIdCache } = await import("@/api/auth/orgCache.js");
const { fetchDashboardRevenueSources } = await import("@/lib/dashboard/listDashboardRevenueSources");
const { fetchDashboardInvoicesSummary, fetchDashboardPayslipsSummary } = await import(
  "@/services/DashboardDataService"
);
const { listAllPosSalesEvents } = await import("@/utils/cashFlowData");

beforeEach(() => {
  clearOrgIdCache();
  state.calls = [];
  state.sessionUser = USER;
  state.ownedOrg = OWNED_ORG;
  state.memberOrg = EMPLOYER_ORG;
});

const dataCalls = () => state.calls.filter((c) => !["organizations", "memberships"].includes(c.table));

describe("dashboard raw reads are scoped to the active business", () => {
  it("revenue sources (invoices, payments, POS, quotes) filter on the owned business", async () => {
    await fetchDashboardRevenueSources();
    const tables = dataCalls().map((c) => c.table).sort();
    expect(tables).toEqual(["invoices", "payments", "pos_sales_events", "quotes"]);
    for (const c of dataCalls()) expect(c.filters.org_id, c.table).toBe(OWNED_ORG);
  });

  it("invoice / payslip strips and POS takings filter on the active business", async () => {
    await fetchDashboardInvoicesSummary();
    await fetchDashboardPayslipsSummary();
    await listAllPosSalesEvents();
    expect(dataCalls().map((c) => c.table)).toEqual(["invoices", "payslips", "pos_sales_events"]);
    for (const c of dataCalls()) expect(c.filters.org_id, c.table).toBe(OWNED_ORG);
  });

  it("a pure employee is scoped to the employer", async () => {
    state.ownedOrg = null;
    await fetchDashboardRevenueSources();
    for (const c of dataCalls()) expect(c.filters.org_id, c.table).toBe(EMPLOYER_ORG);
  });

  it("no session / no business → no reads at all (fail closed)", async () => {
    state.sessionUser = null;
    expect(await fetchDashboardRevenueSources()).toEqual({ invoices: [], payments: [], posSales: [], quotes: [] });
    expect(await fetchDashboardInvoicesSummary()).toEqual([]);
    expect(await listAllPosSalesEvents()).toEqual([]);
    state.sessionUser = USER;
    state.ownedOrg = null;
    state.memberOrg = null;
    expect(await fetchDashboardPayslipsSummary()).toEqual([]);
    expect(dataCalls()).toEqual([]);
  });
});
