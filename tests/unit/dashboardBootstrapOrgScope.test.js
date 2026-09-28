/**
 * GET /api/dashboard/bootstrap must be about ONE business: the one the caller owns, else their earliest
 * membership — never an arbitrary `memberships.limit(1)` row and never an unfiltered read that merges every
 * company RLS lets them see (same-email owner of Business B who also works at Company A).
 */
import { describe, expect, it } from "vitest";
import { buildDashboardBootstrapPayload } from "../../server/src/dashboardBootstrapPayload.js";

const USER = "b0000000-0000-4000-8000-000000000001";
const ORG_A = "a0000000-0000-4000-8000-0000000000aa"; // employer (membership only)
const ORG_B = "b0000000-0000-4000-8000-0000000000bb"; // owned

/** Minimal PostgREST fake: records every executed request (awaited builder) with its filters. */
function fakeSupabase({ ownedOrg = null, memberOrg = null, rowsByOrg = {} } = {}) {
  const calls = [];
  const from = (table) => {
    const call = { table, filters: {} };
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col, val) => {
        call.filters[col] = val;
        return builder;
      },
      maybeSingle: async () => {
        calls.push(call);
        if (table === "organizations" && call.filters.owner_id) return { data: ownedOrg ? { id: ownedOrg } : null };
        if (table === "organizations" && call.filters.id) return { data: { id: call.filters.id, name: "Org" } };
        if (table === "memberships") return { data: memberOrg ? { org_id: memberOrg } : null };
        if (table === "profiles") return { data: { id: USER } };
        if (table === "business_goals") return { data: null };
        return { data: null };
      },
      then: (resolve) => {
        calls.push(call);
        // Unfiltered read = what RLS alone returns: every org's rows merged.
        const org = call.filters.org_id;
        const data = org ? rowsByOrg[org]?.[table] ?? [] : Object.values(rowsByOrg).flatMap((r) => r[table] ?? []);
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { from, calls };
}

const rowsByOrg = {
  [ORG_A]: { payments: [{ id: "pa", amount: 1000 }], invoices: [{ id: "ia" }], expenses: [{ id: "ea" }] },
  [ORG_B]: { payments: [{ id: "pb", amount: 555 }], invoices: [{ id: "ib" }], expenses: [] },
};

describe("dashboard bootstrap business context", () => {
  it("owner of Business B who works at Company A gets ONLY Business B", async () => {
    const sb = fakeSupabase({ ownedOrg: ORG_B, memberOrg: ORG_A, rowsByOrg });
    const body = await buildDashboardBootstrapPayload(sb, { userId: USER, calendarYear: 2026 });

    expect(body.organization.id).toBe(ORG_B);
    expect(body.dashboard.payments.map((p) => p.id)).toEqual(["pb"]);
    expect(body.recentInvoices.map((i) => i.id)).toEqual(["ib"]);
    expect(body.dashboard.expenses).toEqual([]);
  });

  it("every business-data read carries an explicit org_id filter", async () => {
    const sb = fakeSupabase({ ownedOrg: ORG_B, memberOrg: ORG_A, rowsByOrg });
    await buildDashboardBootstrapPayload(sb, { userId: USER, calendarYear: 2026 });
    for (const table of ["invoices", "clients", "quotes", "payslips", "expenses", "payments"]) {
      const reads = sb.calls.filter((c) => c.table === table);
      expect(reads.length, table).toBeGreaterThan(0);
      for (const r of reads) expect(r.filters.org_id, table).toBe(ORG_B);
    }
  });

  it("pure employee (no owned org) is scoped to the employer only", async () => {
    const sb = fakeSupabase({ ownedOrg: null, memberOrg: ORG_A, rowsByOrg });
    const body = await buildDashboardBootstrapPayload(sb, { userId: USER, calendarYear: 2026 });
    expect(body.organization.id).toBe(ORG_A);
    expect(body.dashboard.payments.map((p) => p.id)).toEqual(["pa"]);
  });

  it("no business at all → empty dashboard, never an unfiltered read", async () => {
    const sb = fakeSupabase({ rowsByOrg });
    const body = await buildDashboardBootstrapPayload(sb, { userId: USER, calendarYear: 2026 });
    expect(body.organization).toBeNull();
    expect(body.dashboard.payments).toEqual([]);
    expect(body.recentInvoices).toEqual([]);
    expect(sb.calls.filter((c) => c.table === "payments")).toEqual([]);
  });
});
