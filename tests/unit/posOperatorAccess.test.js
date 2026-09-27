/**
 * POS operator access: codes → scoped till session, isolation from the back office,
 * operator attribution, table assignment, providers. In-memory Supabase, real handlers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables } = vi.hoisted(() => {
  const tables = {};
  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    if (f.op === "is") return f.value === null ? v == null : v === f.value;
    if (f.op === "gte") return String(v ?? "") >= String(f.value ?? "");
    if (f.op === "lte") return String(v ?? "") <= String(f.value ?? "");
    return true;
  };
  const uniques = {
    pos_access_codes: [
      (r, o) => !r.revoked_at && !o.revoked_at && r.membership_id === o.membership_id,
      (r, o) => !r.revoked_at && !o.revoked_at && r.org_id === o.org_id && r.code_hash === o.code_hash,
    ],
    pos_tabs: [(r, o) => r.status === "open" && o.status === "open" && r.table_id && r.table_id === o.table_id, (r, o) => r.org_id === o.org_id && r.order_number === o.order_number],
  };
  const violates = (table, row, selfId) => (uniques[table] || []).some((rule) => (tables[table] || []).some((o) => o.id !== selfId && rule(row, o)));
  const memory = {
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [], limit: null };
      const run = () => {
        if (st.action === "insert") {
          const now = new Date().toISOString();
          const out = [];
          for (const p of Array.isArray(st.payload) ? st.payload : [st.payload]) {
            const rec = { id: randomUUID(), created_at: now, updated_at: now, ...p };
            if (table === "pos_tabs") rec.opened_at ||= now;
            if (table === "pos_access_code_failures") rec.failed_at ||= now;
            if (violates(table, rec, null)) return { error: { code: "23505", message: `duplicate key ${table}` } };
            if (table === "pos_access_sessions" && rec.user_id && !(tables.auth_users || []).some((u) => u.id === rec.user_id)) {
              return { error: { code: "23503", message: 'insert or update on table "pos_access_sessions" violates foreign key constraint "pos_access_sessions_user_id_fkey"' } };
            }
            tables[table].push(rec);
            out.push(rec);
          }
          return { data: out };
        }
        const found = tables[table].filter((r) => st.filters.every((f) => matches(r, f)));
        if (st.action === "update") {
          found.forEach((r) => Object.assign(r, st.payload));
          return { data: found };
        }
        if (st.action === "delete") {
          tables[table] = tables[table].filter((r) => !found.includes(r));
          return { data: found };
        }
        return { data: st.limit != null ? found.slice(0, st.limit) : found };
      };
      const api = {
        select: () => api,
        insert: (p) => ((st.action = "insert"), (st.payload = p), api),
        update: (p) => ((st.action = "update"), (st.payload = p), api),
        delete: () => ((st.action = "delete"), api),
        eq: (col, value) => (st.filters.push({ op: "eq", col, value }), api),
        in: (col, value) => (st.filters.push({ op: "in", col, value }), api),
        is: (col, value) => (st.filters.push({ op: "is", col, value }), api),
        gte: (col, value) => (st.filters.push({ op: "gte", col, value }), api),
        lte: (col, value) => (st.filters.push({ op: "lte", col, value }), api),
        order: () => api,
        limit: (n) => ((st.limit = n), api),
        maybeSingle: async () => {
          const r = run();
          return r.error ? { data: null, error: r.error } : { data: r.data[0] || null, error: null };
        },
        single: async () => {
          const r = run();
          if (r.error) return { data: null, error: r.error };
          return r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: "no rows" } };
        },
        then: (res, rej) => {
          const r = run();
          return Promise.resolve(r.error ? { data: null, error: r.error } : { data: r.data, error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
  return { memory, tables };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/pos/posEntitlement.js", () => ({ requirePosPlan: async () => true, requirePosPlanForOrg: async () => true }));
vi.mock("../../server/src/workforce/workforceAudit.js", () => ({ writeWorkforceAudit: async () => null }));
// Supabase Auth rejects a till token (it is not a JWT) — the same outcome as production.
vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async () => ({ user: null, error: "Unauthorized" }),
  requireAuthMiddleware: (_req, res) => res.status(401).json({ error: "Unauthorized" }),
}));

const codes = await import("../../server/src/pos/posAccessCodes.js");
const { runPosOperatorAction } = await import("../../server/src/workforce/posOperatorAccess.js");
const { requireOrgMember } = await import("../../server/src/pos/posConnectionsRoutes.js");
const { handleDocumentTimeline } = await import("../../server/src/documents/documentEventRoutes.js");
const { handleDocumentRemind } = await import("../../server/src/payments/documentPaymentRoutes.js");
const { handlePaymentIntentGet } = await import("../../server/src/payments/paymentIntentRoutes.js");
const { dispatchRestaurantRoute } = await import("../../server/src/pos/restaurant/posRestaurantDispatch.js");
const { providerStatuses } = await import("../../server/src/pos/posProviders.js");
const { POS_PROVIDER_OPTIONS, POS_PROVIDER_NOT_SUPPORTED } = await import("../../shared/pos/posProviderCatalog.js");

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const TILL_A = "aaaaaaaa-1111-4000-8000-000000000001";
const TILL_A2 = "aaaaaaaa-1111-4000-8000-000000000002";
const TILL_B = "bbbbbbbb-1111-4000-8000-000000000001";
const MANDO = "aaaaaaaa-2222-4000-8000-000000000001";
const THABO = "aaaaaaaa-2222-4000-8000-000000000002";
const ACCOUNTANT = "aaaaaaaa-2222-4000-8000-000000000003";
const B_STAFF = "bbbbbbbb-2222-4000-8000-000000000001";
const MANAGER = { userId: "manager-user", companyId: ORG_A };

function res() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.end = () => r;
  return r;
}
async function call(handler, req) {
  const r = res();
  await handler({ headers: {}, query: {}, body: {}, method: "GET", ...req }, r);
  return r;
}
const unlock = (till, code, headers = {}) => call(codes.handlePosCodeUnlock, { method: "POST", body: { till_id: till, code }, headers });
const bearer = (token) => ({ authorization: `Bearer pos.${token}` });

const saved = {};
beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  saved.key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  tables.organizations = [
    { id: ORG_A, name: "CoffeeShop", business_type: "restaurant" },
    { id: ORG_B, name: "Other Co", business_type: "retail" },
  ];
  tables.pos_registers = [
    { id: TILL_A, org_id: ORG_A, name: "Main Till", status: "active" },
    { id: TILL_A2, org_id: ORG_A, name: "Bar Till", status: "active" },
    { id: TILL_B, org_id: ORG_B, name: "Front", status: "active" },
  ];
  tables.memberships = [
    { id: MANDO, org_id: ORG_A, user_id: null, role: "employee", job_function: "pos", invited_name: "Mando" },
    { id: THABO, org_id: ORG_A, user_id: null, role: "employee", job_function: "pos", invited_name: "Thabo", pos_register_id: TILL_A2 },
    { id: ACCOUNTANT, org_id: ORG_A, user_id: null, role: "employee", job_function: "general", invited_name: "Accountant" },
    { id: B_STAFF, org_id: ORG_B, user_id: null, role: "employee", job_function: "pos", invited_name: "B" },
  ];
  tables.pos_register_sessions = [{ id: "shift-a", org_id: ORG_A, register_id: TILL_A, status: "open", opened_at: new Date().toISOString() }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  vi.restoreAllMocks();
});

const generate = async (membershipId, org = ORG_A, extra = {}) => runPosOperatorAction(org, MANAGER, "pos_code_generate", membershipId, extra);

describe("POS access codes (credential)", () => {
  it("generates a 6-digit code shown once and stores only a keyed hash", async () => {
    const out = await generate(MANDO);
    expect(out.code).toMatch(/^\d{6}$/);
    expect(codes.isWeakPosAccessCode(out.code)).toBe(false);
    const row = tables.pos_access_codes[0];
    expect(JSON.stringify(tables.pos_access_codes)).not.toContain(out.code);
    expect(row.code_hash).toBe(codes.hashPosAccessCode(ORG_A, out.code));
    expect(out.pos_access.code).toMatchObject({ status: "active" });
    expect(JSON.stringify(out.pos_access)).not.toContain(row.code_hash);
    // Status reads never return the code.
    const status = await runPosOperatorAction(ORG_A, MANAGER, "pos_access_status", MANDO);
    expect(JSON.stringify(status)).not.toContain(out.code);
  });

  it("weak codes are never issued and the hash is keyed per business", () => {
    for (const weak of ["000000", "123456", "654321", "121212", "123123"]) expect(codes.isWeakPosAccessCode(weak)).toBe(true);
    expect(codes.hashPosAccessCode(ORG_A, "482913")).not.toBe(codes.hashPosAccessCode(ORG_B, "482913"));
  });

  it("only POS-enabled employees get a code", async () => {
    await expect(generate(ACCOUNTANT)).rejects.toMatchObject({ code: "POS_NOT_ENABLED_FOR_EMPLOYEE" });
  });
});

describe("/pos code entry → scoped POS session", () => {
  it("till info shows the till and business, not operators", async () => {
    const r = await call(codes.handlePosTillInfo, { query: { id: TILL_A } });
    expect(r.body).toEqual({ ok: true, till: { id: TILL_A, name: "Main Till" }, business: { name: "CoffeeShop" } });
    expect((await call(codes.handlePosTillInfo, { query: { id: randomUUID() } })).statusCode).toBe(404);
  });

  it("a valid code opens a till session scoped to the business, operator, till and credential", async () => {
    const { code } = await generate(MANDO);
    const r = await unlock(TILL_A, code);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({
      scope: "pos",
      auth_method: "code",
      membership_id: MANDO,
      org: { id: ORG_A, name: "CoffeeShop" },
      register: { id: TILL_A, name: "Main Till" },
      role: "employee",
      job_function: "pos",
      employee: { name: "Mando" },
      open_shift: expect.objectContaining({ id: "shift-a" }),
    });
    expect(r.headers["Set-Cookie"]).toMatch(/HttpOnly/);
    const session = tables.pos_access_sessions[0];
    expect(session).toMatchObject({ org_id: ORG_A, membership_id: MANDO, register_id: TILL_A, credential_id: tables.pos_access_codes[0].id });
    expect(session.token_hash).not.toBe(r.body.access_token);
    expect(tables.pos_access_codes[0].last_used_at).toBeTruthy();

    // The gate resolves that session to a POS-only membership of company A.
    const gate = await requireOrgMember({ headers: bearer(r.body.access_token) }, res());
    expect(gate).toMatchObject({ ok: true, posAccess: true, membership: { id: MANDO, orgId: ORG_A, companyRole: "employee", jobFunction: "pos" } });
  });

  it("opens the till even when the employee's linked Paidly login no longer exists", async () => {
    tables.memberships.find((m) => m.id === MANDO).user_id = "deleted-auth-user";
    const { code } = await generate(MANDO);
    const r = await unlock(TILL_A, code);
    expect(r.statusCode).toBe(200);
    expect(tables.pos_access_sessions[0]).toMatchObject({ membership_id: MANDO, user_id: null });
    const gate = await requireOrgMember({ headers: bearer(r.body.access_token) }, res());
    expect(gate).toMatchObject({ ok: true, membership: { id: MANDO, orgId: ORG_A } });
  });

  it("keeps the login link when the employee's Paidly login exists", async () => {
    tables.auth_users = [{ id: "real-user" }];
    tables.memberships.find((m) => m.id === MANDO).user_id = "real-user";
    const { code } = await generate(MANDO);
    expect((await unlock(TILL_A, code)).statusCode).toBe(200);
    expect(tables.pos_access_sessions[0].user_id).toBe("real-user");
  });

  it("rejects wrong codes with one generic message and rate-limits a till", async () => {
    await generate(MANDO);
    const bad = await unlock(TILL_A, "999991");
    expect(bad.statusCode).toBe(401);
    expect(bad.body.code).toBe("POS_CODE_INVALID");
    for (let i = 0; i < codes.POS_CODE_MAX_FAILURES_PER_TILL; i += 1) await unlock(TILL_A, "999992");
    expect((await unlock(TILL_A, "999993")).body.code).toBe("POS_CODE_RATE_LIMITED");
  });

  it("company A's code does not open company B's till (no cross-company access)", async () => {
    const { code } = await generate(MANDO);
    const r = await unlock(TILL_B, code);
    expect(r.statusCode).toBe(401);
    expect(tables.pos_access_sessions || []).toHaveLength(0);
  });

  it("respects till assignment (employee or code bound to another till)", async () => {
    const thabo = await generate(THABO);
    expect((await unlock(TILL_A, thabo.code)).body.code).toBe("TILL_NOT_ASSIGNED");
    expect((await unlock(TILL_A2, thabo.code)).statusCode).toBe(200);
    const mando = await generate(MANDO, ORG_A, { register_id: TILL_A2 });
    expect((await unlock(TILL_A, mando.code)).body.code).toBe("POS_CODE_INVALID");
  });

  it("regenerating invalidates the previous code and ends its till session immediately", async () => {
    const first = await generate(MANDO);
    const session = await unlock(TILL_A, first.code);
    const second = await generate(MANDO);
    expect(second.code).not.toBe(first.code);
    expect((await unlock(TILL_A, first.code)).statusCode).toBe(401);
    const gate = await requireOrgMember({ headers: bearer(session.body.access_token) }, res());
    expect(gate.ok).toBe(false);
    expect((await unlock(TILL_A, second.code)).statusCode).toBe(200);
  });

  it("revoked codes and disabled operators are rejected", async () => {
    const { code } = await generate(MANDO);
    const session = await unlock(TILL_A, code);
    await runPosOperatorAction(ORG_A, MANAGER, "pos_code_revoke", MANDO);
    expect((await unlock(TILL_A, code)).statusCode).toBe(401);

    const again = await generate(MANDO);
    await runPosOperatorAction(ORG_A, MANAGER, "pos_access_disable", MANDO);
    expect((await unlock(TILL_A, again.code)).statusCode).toBe(401); // disabling also revokes the code
    expect((await requireOrgMember({ headers: bearer(session.body.access_token) }, res())).ok).toBe(false);
    await expect(generate(MANDO)).rejects.toMatchObject({ code: "POS_ACCESS_DISABLED" });
    await runPosOperatorAction(ORG_A, MANAGER, "pos_access_enable", MANDO);
    expect((await generate(MANDO)).code).toMatch(/^\d{6}$/);
  });

  it("Lock POS ends the session; the code is needed again", async () => {
    const { handlePosAccessEnd } = await import("../../server/src/pos/posInviteActivate.js");
    const { code } = await generate(MANDO);
    const session = await unlock(TILL_A, code);
    const token = session.body.access_token;
    const lock = await call(handlePosAccessEnd, { method: "POST", headers: bearer(token) });
    expect(lock.headers["Set-Cookie"]).toMatch(/Max-Age=0/);
    expect((await requireOrgMember({ headers: bearer(token) }, res())).ok).toBe(false);
    // Locking never creates a Paidly login: no auth session exists, only another code opens the till.
    expect((await unlock(TILL_A, code)).statusCode).toBe(200);
  });
});

describe("till sessions stay inside POS (server-side)", () => {
  async function tillToken() {
    const { code } = await generate(MANDO);
    return (await unlock(TILL_A, code)).body.access_token;
  }

  it("invoice timeline and reminders refuse a till session", async () => {
    const token = await tillToken();
    const timeline = await call(handleDocumentTimeline, { headers: bearer(token), query: { document_id: randomUUID() } });
    expect(timeline.statusCode).toBe(403);
    expect(timeline.body.code).toBe("POS_SCOPE");
    const remind = await call(handleDocumentRemind, { method: "POST", headers: bearer(token), body: { invoice_id: randomUUID() } });
    expect(remind.body.code).toBe("POS_SCOPE");
  });

  it("a till session cannot read invoice payment intents, only till ones", async () => {
    const token = await tillToken();
    tables.payment_intents = [
      { id: "11111111-0000-4000-8000-000000000001", org_id: ORG_A, source_kind: "document", provider: "ozow", status: "paid", amount: 10 },
      { id: "11111111-0000-4000-8000-000000000002", org_id: ORG_A, source_kind: "pos", provider: "cash", status: "paid", amount: 10 },
    ];
    const doc = await call(handlePaymentIntentGet, { headers: bearer(token), params: { id: "11111111-0000-4000-8000-000000000001" } });
    expect(doc.statusCode).toBe(404);
    const pos = await call(handlePaymentIntentGet, { headers: bearer(token), params: { id: "11111111-0000-4000-8000-000000000002" } });
    expect(pos.statusCode).toBe(200);
  });

  it("a till session cannot manage floors or payment providers (settings managers only)", async () => {
    const token = await tillToken();
    const setup = await call((req, r) => dispatchRestaurantRoute("restaurant-floor-setup", req, r), { method: "POST", headers: bearer(token), body: { action: "create_floor", name: "X" } });
    expect(setup.statusCode).toBe(401);
    const providers = await call((req, r) => dispatchRestaurantRoute("pos-providers", req, r), { headers: bearer(token) });
    expect(providers.statusCode).toBe(401);
  });
});

describe("restaurant: table assignment and operator attribution", () => {
  const mgrGate = { ok: true, user: { id: "manager-user" }, membership: { orgId: ORG_A, companyRole: "owner" } };

  it("one operator can be assigned many tables, and their order records operator + till + shift", async () => {
    const { handleRestaurantSetup } = await import("../../server/src/pos/restaurant/posRestaurantRoutes.js");
    const floor = await call((req, r) => handleRestaurantSetup(req, r, mgrGate), { method: "POST", body: { action: "create_floor", name: "Main" } });
    const floorId = floor.body.floor.id;
    for (const name of ["1", "2", "5", "7"]) {
      const r = await call((req, rr) => handleRestaurantSetup(req, rr, mgrGate), {
        method: "POST",
        body: { action: "create_table", floor_id: floorId, name, seats: 4, assigned_membership_id: MANDO },
      });
      expect(r.statusCode).toBe(201);
    }
    expect(tables.pos_tables.filter((t) => t.assigned_membership_id === MANDO)).toHaveLength(4);
    // Another business's employee can't be assigned.
    const cross = await call((req, r) => handleRestaurantSetup(req, r, mgrGate), {
      method: "POST",
      body: { action: "update_table", id: tables.pos_tables[0].id, assigned_membership_id: B_STAFF },
    });
    expect(cross.statusCode).toBe(404);

    const { code } = await generate(MANDO);
    const token = (await unlock(TILL_A, code)).body.access_token;
    const floorView = await call((req, r) => dispatchRestaurantRoute("restaurant-floor", req, r), { headers: bearer(token) });
    expect(floorView.body.tables.filter((t) => t.assigned_name === "Mando")).toHaveLength(4);

    const table5 = tables.pos_tables.find((t) => t.name === "5");
    const opened = await call((req, r) => dispatchRestaurantRoute("restaurant-tab", req, r), {
      method: "POST",
      headers: bearer(token),
      body: { action: "open", table_id: table5.id, guests: 2, server_name: "Someone Else" },
    });
    expect(opened.statusCode).toBe(201);
    expect(opened.body.tab).toMatchObject({ server_membership_id: MANDO, register_id: TILL_A, register_session_id: "shift-a", server_name: "Mando" });
    const table7 = tables.pos_tables.find((t) => t.name === "7");
    const second = await call((req, r) => dispatchRestaurantRoute("restaurant-tab", req, r), {
      method: "POST",
      headers: bearer(token),
      body: { action: "open", table_id: table7.id, guests: 3 },
    });
    expect(second.statusCode).toBe(201);
    expect(tables.pos_tabs.filter((t) => t.server_membership_id === MANDO && t.status === "open")).toHaveLength(2);
  });
});

describe("payment providers", () => {
  it("lists only implemented providers, none is the default, and Ozow is optional", () => {
    const ids = POS_PROVIDER_OPTIONS.map((p) => p.id);
    expect(ids).toEqual(["yoco", "square", "ozow", "paidly_pay"]);
    expect(ids).not.toContain("payfast");
    expect(POS_PROVIDER_NOT_SUPPORTED.payfast).toMatch(/subscription/i);
    expect(POS_PROVIDER_OPTIONS.some((p) => p.default)).toBe(false);
  });

  it("status comes from real state only — nothing is connected by default", () => {
    const none = providerStatuses({});
    expect(none.map((p) => [p.id, p.status])).toEqual([
      ["yoco", "not_connected"],
      ["square", "not_connected"],
      ["ozow", "unavailable"],
      ["paidly_pay", "coming_soon"],
    ]);
    const live = providerStatuses({ connections: [{ id: "c1", provider: "yoco", status: "active" }], onlineProviderId: "ozow" });
    expect(live.find((p) => p.id === "yoco")).toMatchObject({ status: "connected", connection_id: "c1" });
    expect(live.find((p) => p.id === "ozow").status).toBe("available");
  });

  it("a custom provider is saved as a request and never reported connected", async () => {
    const { handlePosProvidersPost, handlePosProvidersGet } = await import("../../server/src/pos/posProviders.js");
    const gate = { ok: true, user: { id: "manager-user" }, membership: { orgId: ORG_A } };
    const created = await call((req, r) => handlePosProvidersPost(req, r, gate), {
      method: "POST",
      body: { action: "request_custom", provider_name: "PayFast", method: "online_eft", api_key: "should-not-be-stored" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body.custom).toMatchObject({ status: "requested", connected: false });
    expect(JSON.stringify(tables.pos_custom_providers)).not.toContain("should-not-be-stored");
    const list = await call((req, r) => handlePosProvidersGet(req, r, gate), {});
    expect(list.body.custom.every((c) => c.connected === false && c.status === "requested")).toBe(true);
    expect(list.body.providers.some((p) => p.status === "connected")).toBe(false);
  });
});
