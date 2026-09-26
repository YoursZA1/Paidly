/**
 * Shift reconciliation with restaurant tables: closing a shift while table bills are still open on
 * that till asks for confirmation (OPEN_TABS); with allow_open_tabs it closes as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables } = vi.hoisted(() => ({ tables: {} }));

vi.mock("../../server/src/supabaseAdmin.js", () => {
  const from = (table) => {
    const st = { filters: [], action: "select", payload: null };
    const rows = () => (tables[table] || []).filter((r) => st.filters.every(([c, v]) => String(r[c]) === String(v)));
    const api = {
      select: () => api,
      update: (p) => ((st.action = "update"), (st.payload = p), api),
      eq: (c, v) => (st.filters.push([c, v]), api),
      in: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => {
        const found = rows();
        if (st.action === "update") found.forEach((r) => Object.assign(r, st.payload));
        return { data: found[0] || null, error: null };
      },
      then: (res) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return api;
  };
  return { supabaseAdmin: { from } };
});
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({
  requirePosPermission: async () => ({ ok: true, user: { id: "u1" }, membership: { orgId: "org-1", id: "m1", companyRole: "owner" } }),
}));
vi.mock("../../server/src/workforce/workforceAudit.js", () => ({ writeWorkforceAudit: async () => null }));

const { handlePosSessionClose } = await import("../../server/src/pos/posRegisterSessions.js");

const SESSION = "5e551011-0000-4000-8000-000000000001";
function res() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
}

beforeEach(() => {
  tables.pos_register_sessions = [{ id: SESSION, org_id: "org-1", register_id: "reg-1", status: "open", opening_balance: 100 }];
  tables.pos_sales_events = [];
  tables.pos_tabs = [
    { id: "tab-1", org_id: "org-1", register_id: "reg-1", status: "open" },
    { id: "tab-2", org_id: "org-1", register_id: "reg-2", status: "open" },
  ];
});

describe("close shift with open table orders", () => {
  it("asks for confirmation when this till still has open tables", async () => {
    const r = res();
    await handlePosSessionClose({ params: { id: SESSION }, body: { closing_cash: 100 }, headers: {} }, r);
    expect(r.statusCode).toBe(409);
    expect(r.body).toMatchObject({ code: "OPEN_TABS", open_tabs: 1 });
    expect(tables.pos_register_sessions[0].status).toBe("open");
  });

  it("closes when confirmed, or when no tables are open on this till", async () => {
    const r = res();
    await handlePosSessionClose({ params: { id: SESSION }, body: { closing_cash: 100, allow_open_tabs: true }, headers: {} }, r);
    expect(r.body?.code).not.toBe("OPEN_TABS");
    expect(tables.pos_register_sessions[0].status).toBe("closed");

    tables.pos_register_sessions[0].status = "open";
    tables.pos_tabs = [];
    const r2 = res();
    await handlePosSessionClose({ params: { id: SESSION }, body: { closing_cash: 100 }, headers: {} }, r2);
    expect(tables.pos_register_sessions[0].status).toBe("closed");
  });
});
