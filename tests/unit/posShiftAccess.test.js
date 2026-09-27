/**
 * Shifts with operator codes: a session opened with the operator's own code starts a shift without a
 * second PIN (the code authenticated them); other POS-enabled sessions still need the PIN. Shift history
 * filters reach the query; opener attribution is the membership.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, gate, pinCalls, queries } = vi.hoisted(() => ({ tables: {}, gate: { current: null }, pinCalls: [], queries: [] }));

vi.mock("../../server/src/supabaseAdmin.js", () => {
  const from = (table) => {
    const st = { filters: [], action: "select", payload: null };
    queries.push({ table, st });
    const rows = () =>
      (tables[table] || []).filter((r) =>
        st.filters.every(([op, c, v]) => (op === "eq" ? String(r[c]) === String(v) : op === "gte" ? String(r[c]) >= v : op === "lte" ? String(r[c]) <= v : op === "in" ? v.includes(r[c]) : true))
      );
    const api = {
      select: () => api,
      insert: (p) => ((st.action = "insert"), (st.payload = p), api),
      update: (p) => ((st.action = "update"), (st.payload = p), api),
      eq: (c, v) => (st.filters.push(["eq", c, v]), api),
      gte: (c, v) => (st.filters.push(["gte", c, v]), api),
      lte: (c, v) => (st.filters.push(["lte", c, v]), api),
      in: (c, v) => (st.filters.push(["in", c, v]), api),
      is: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      single: async () => {
        if (st.action === "insert") {
          const rec = { id: `row-${(tables[table] || []).length + 1}`, ...st.payload };
          (tables[table] ||= []).push(rec);
          return { data: rec, error: null };
        }
        return { data: rows()[0] || null, error: null };
      },
      then: (res) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return api;
  };
  return { supabaseAdmin: { from } };
});
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({ requirePosPermission: async () => gate.current }));
vi.mock("../../server/src/workforce/workforceAudit.js", () => ({ writeWorkforceAudit: async () => null }));
vi.mock("../../server/src/pos/posPinRoutes.js", () => ({
  verifyMembershipPosPin: async (orgId, membershipId, pin) => {
    pinCalls.push({ membershipId, pin });
    return pin === "4321" ? { ok: true } : { ok: false, status: 401, error: "Wrong PIN", code: "POS_PIN_INVALID" };
  },
}));

const { handlePosSessionOpen, handlePosSessionsList } = await import("../../server/src/pos/posRegisterSessions.js");

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const TILL = "aaaaaaaa-1111-4000-8000-000000000001";
const MANDO = "aaaaaaaa-2222-4000-8000-000000000001";

function res() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
}
const operator = (session) => ({
  ok: true,
  posAccess: true,
  user: { id: null },
  session,
  membership: { id: MANDO, orgId: ORG, companyRole: "employee", jobFunction: "pos", posRegisterId: TILL },
});

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  pinCalls.length = 0;
  queries.length = 0;
  tables.pos_registers = [{ id: TILL, org_id: ORG, name: "Main Till", status: "active", opening_balance: 100 }];
  tables.pos_register_sessions = [];
});

describe("opening a shift", () => {
  it("a code-authenticated till session opens the shift without a PIN, attributed to the operator", async () => {
    gate.current = operator({ id: "s1", credential_id: "cred-1" });
    const r = res();
    await handlePosSessionOpen({ body: { register_id: TILL, opening_balance: 100 }, headers: {} }, r);
    expect(pinCalls).toHaveLength(0);
    expect(r.statusCode).toBeLessThan(300);
    expect(tables.pos_register_sessions[0]).toMatchObject({ register_id: TILL, opened_by_membership_id: MANDO, status: "open" });
  });

  it("a till session without an operator code still needs the operator's PIN", async () => {
    gate.current = operator({ id: "s2", credential_id: null });
    const r = res();
    await handlePosSessionOpen({ body: { register_id: TILL, opening_balance: 100, pos_pin: "0000" }, headers: {} }, r);
    expect(pinCalls).toHaveLength(1);
    expect(r.statusCode).toBe(401);
    expect(tables.pos_register_sessions).toHaveLength(0);
  });
});

describe("shift history filters", () => {
  it("passes date, register and operator filters to the query", async () => {
    gate.current = { ok: true, user: { id: "owner" }, membership: { orgId: ORG, companyRole: "owner" } };
    const r = res();
    await handlePosSessionsList(
      { query: { register_id: TILL, from: "2026-09-01", to: "2026-09-27", operator_membership_id: MANDO, limit: "100" }, headers: {} },
      r
    );
    expect(r.statusCode).toBe(200);
    const sessionQuery = queries.find((q) => q.table === "pos_register_sessions");
    expect(sessionQuery.st.filters).toEqual(
      expect.arrayContaining([
        ["eq", "register_id", TILL],
        ["gte", "opened_at", "2026-09-01T00:00:00"],
        ["lte", "opened_at", "2026-09-27T23:59:59.999"],
        ["eq", "opened_by_membership_id", MANDO],
      ])
    );
  });

  it("rejects malformed filters", async () => {
    gate.current = { ok: true, user: { id: "owner" }, membership: { orgId: ORG, companyRole: "owner" } };
    const r = res();
    await handlePosSessionsList({ query: { from: "27/09/2026" }, headers: {} }, r);
    expect(r.statusCode).toBe(422);
  });
});
