/**
 * Demo Mode — server behaviour with the database faked at the module boundary (RLS / SQL behaviour is
 * covered by demoMode.db.test.js on the real replayed schema).
 *
 *  - /api/auth/demo, /demo-reset, /demo-end: identity comes from the verified token only, never the body
 *  - no secret leaves the server; failures are generic
 *  - simulated payments: only a demo org's own demo intents, in any environment; never a provider
 *  - outbound communications from demo users are suppressed with a preview
 *  - every server module that can send email carries a demo guard (static check)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEMO_USER = "d0000000-0000-4000-8000-000000000001";
const REAL_USER = "e0000000-0000-4000-8000-000000000001";
const DEMO_ORG = "d1000000-0000-4000-8000-000000000001";
const REAL_ORG = "e1000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  demoUsers: new Set(),
  demoOrgs: new Set(),
  calls: [],
  rpc: {},
  createUserError: null,
  signInError: null,
  tokenUser: null,
}));

vi.mock("../../server/src/supabaseAdmin.js", () => {
  const from = (table) => {
    const q = { table, filters: {} };
    q.select = () => q;
    q.eq = (col, val) => ((q.filters[col] = val), q);
    q.maybeSingle = async () => {
      if (table === "demo_sessions") {
        return { data: state.demoUsers.has(q.filters.user_id) ? { user_id: q.filters.user_id } : null, error: null };
      }
      if (table === "organizations") {
        return { data: { is_demo: state.demoOrgs.has(q.filters.id) }, error: null };
      }
      return { data: null, error: null };
    };
    return q;
  };
  return {
    supabaseAdmin: {
      from,
      rpc: async (name, args) => {
        state.calls.push(["rpc", name, args]);
        const fn = state.rpc[name];
        return fn ? fn(args) : { data: null, error: null };
      },
      storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) },
      auth: {
        getUser: async (token) =>
          state.tokenUser && token === "good-token"
            ? { data: { user: { id: state.tokenUser, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null }
            : { data: null, error: { message: "bad token" } },
        admin: {
          createUser: async (args) => {
            state.calls.push(["createUser", args]);
            if (state.createUserError) return { data: null, error: state.createUserError };
            return { data: { user: { id: DEMO_USER } }, error: null };
          },
          deleteUser: async (id) => {
            state.calls.push(["deleteUser", id]);
            return { error: null };
          },
          updateUserById: async (id) => {
            state.calls.push(["updateUser", id]);
            return { data: { user: { id } }, error: null };
          },
        },
      },
    },
  };
});

vi.mock("../../server/src/supabaseAnon.js", () => ({
  getSupabaseAnonClient: () => ({
    auth: {
      signInWithPassword: async (args) => {
        state.calls.push(["signIn", { email: args.email, hasPassword: Boolean(args.password) }]);
        if (state.signInError) return { data: null, error: state.signInError };
        return { data: { session: { access_token: "at-123", refresh_token: "rt-456" } }, error: null };
      },
    },
  }),
  getSupabaseUserClient: () => null,
}));

vi.mock("../../server/src/purgeUserStorage.js", () => ({ purgeUserStorageAssets: async () => {} }));

const sendHtmlEmail = vi.fn(async () => ({ success: true, data: { id: "email-1" } }));
vi.mock("../../server/src/sendInvoice.js", () => ({ sendHtmlEmail, sendInvoiceEmail: vi.fn() }));
vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async () => ({ user: state.tokenUser ? { id: state.tokenUser, user_metadata: {} } : null }),
  requireAuthMiddleware: (req, res, next) => next(),
}));
vi.mock("../../server/src/featureGate.js", async (orig) => ({ ...(await orig()), assertUserHasFeature: async () => {} }));

// Payment intent action: gate + engine faked, contract / state machine real.
const posGate = vi.hoisted(() => ({ membership: null }));
const intents = vi.hoisted(() => new Map());
const applied = vi.hoisted(() => []);
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({
  requireOrgMember: async () => ({ ok: true, user: { id: DEMO_USER }, membership: posGate.membership }),
  requirePosPermission: async () => ({ ok: true, user: { id: DEMO_USER }, membership: posGate.membership }),
}));
vi.mock("../../server/src/payments/paymentEngine.js", async (orig) => ({
  ...(await orig()),
  getOrgPaymentIntent: async (orgId, id) => {
    const row = intents.get(id);
    return row && row.org_id === orgId ? row : null;
  },
  applyVerifiedProviderEvent: async (args) => {
    applied.push(args);
    const row = intents.get(args.intentId);
    return { intent: { ...row, status: args.nextStatus }, settlement: { settled: true, saleId: "sale-1" } };
  },
}));

const { handleDemoStart, handleDemoReset, handleDemoEnd, runDemoCleanup, runDemoMaintenance, demoConfig } = await import(
  "../../server/src/demo/demoSessionApi.js"
);
const { clearDemoOrgCache } = await import("../../server/src/demo/demoMode.js");
const { default: sendEmailHandler } = await import("../../server/src/sendEmailApi.js");
const { handlePaymentIntentAction } = await import("../../server/src/payments/paymentIntentRoutes.js");
const { cardTerminalProvider } = await import("../../server/src/payments/providers/cardTerminalProvider.js");
const demoPayments = await import("../../shared/demo/demoPayments.js");

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {}, ended: false };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.end = () => ((res.ended = true), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

function req({ method = "POST", body = {}, token = null, ip = "203.0.113.9" } = {}) {
  return {
    method,
    body,
    url: "/api/auth/demo",
    headers: { "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  };
}

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

beforeEach(() => {
  state.demoUsers = new Set([DEMO_USER]);
  state.demoOrgs = new Set([DEMO_ORG]);
  state.calls = [];
  state.createUserError = null;
  state.signInError = null;
  state.tokenUser = null;
  state.rpc = {
    demo_active_workspace_count: () => ({ data: 3, error: null }),
    purge_expired_demo_workspaces: () => ({ data: [], error: null }),
    provision_demo_workspace: (args) => ({
      data: { org_id: DEMO_ORG, expires_at: "2026-10-01T12:00:00Z", business_name: "Mavela Café", user: args.p_user_id },
      error: null,
    }),
    reset_demo_workspace: () => ({ data: { org_id: DEMO_ORG, expires_at: "2026-10-01T12:00:00Z" }, error: null }),
    purge_demo_workspace: () => ({ data: DEMO_ORG, error: null }),
  };
  sendHtmlEmail.mockClear();
  clearDemoOrgCache();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/demo", () => {
  it("creates a dedicated demo user + workspace and returns a normal session, never the password", async () => {
    const res = mockRes();
    await handleDemoStart(req({ ip: freshIp(), body: { org_id: REAL_ORG, user_id: REAL_USER } }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      access_token: "at-123",
      refresh_token: "rt-456",
      demo: { business_name: "Mavela Café" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|service|secret/i);

    const create = state.calls.find((c) => c[0] === "createUser")[1];
    expect(create.email).toMatch(/^demo-[0-9a-f]{18}@example\.com$/);
    expect(create.email_confirm).toBe(true);
    expect(create.app_metadata).toEqual({ paidly_demo: true });
    expect(create.user_metadata.pending_company_invite).toBe("true");
    expect(create.password.length).toBeGreaterThanOrEqual(40);

    // Provisioned for the user the server created — body ids are ignored.
    const provision = state.calls.find((c) => c[1] === "provision_demo_workspace")[2];
    expect(provision.p_user_id).toBe(DEMO_USER);
    expect(JSON.stringify(state.calls)).not.toContain(REAL_ORG);
    expect(JSON.stringify(state.calls)).not.toContain(REAL_USER);
  });

  it("rolls back and returns a generic error when provisioning fails (no raw DB error)", async () => {
    state.rpc.provision_demo_workspace = () => ({ data: null, error: { message: 'relation "x" violates constraint secret_detail' } });
    const res = mockRes();
    await handleDemoStart(req({ ip: freshIp() }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe("DEMO_START_FAILED");
    expect(JSON.stringify(res.body)).not.toMatch(/relation|constraint|secret_detail/);
    expect(state.calls.some((c) => c[1] === "purge_demo_workspace")).toBe(true);
    expect(state.calls).toContainEqual(["deleteUser", DEMO_USER]);
  });

  it("refuses when the demo is at capacity or switched off", async () => {
    vi.stubEnv("PAIDLY_DEMO_MAX_ACTIVE", "3");
    let res = mockRes();
    await handleDemoStart(req({ ip: freshIp() }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("DEMO_BUSY");
    expect(state.calls.some((c) => c[0] === "createUser")).toBe(false);

    vi.stubEnv("PAIDLY_DEMO_ENABLED", "false");
    res = mockRes();
    await handleDemoStart(req({ ip: freshIp() }), res);
    expect(res.body.code).toBe("DEMO_DISABLED");
  });

  it("rate-limits demo creation per network", async () => {
    vi.stubEnv("PAIDLY_DEMO_START_PER_IP_MAX", "2");
    const ip = freshIp();
    const codes = [];
    for (let i = 0; i < 3; i += 1) {
      const res = mockRes();
      await handleDemoStart(req({ ip }), res);
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([201, 201, 429]);
  });

  it("returns a session without waiting for expired-demo cleanup", async () => {
    state.rpc.purge_expired_demo_workspaces = () => ({ data: [{ user_id: "old-user", org_id: "old-org" }], error: null });
    const res = mockRes();
    await handleDemoStart(req({ ip: freshIp() }), res);
    expect(res.statusCode).toBe(201);
    expect(state.calls).not.toContainEqual(["deleteUser", "old-user"]);
  });

  it("claims a prepared workspace instead of seeding one during login", async () => {
    state.rpc.claim_pooled_demo_workspace = () => ({
      data: {
        user_id: "pooled-user",
        email: "demo-pool@example.com",
        expires_at: "2026-10-01T14:00:00Z",
        business_name: "Mavela Café",
      },
      error: null,
    });
    const res = mockRes();
    await handleDemoStart(req({ ip: freshIp(), body: { org_id: REAL_ORG, user_id: REAL_USER } }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.demo).toMatchObject({ business_name: "Mavela Café" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|email|pooled-user|service|secret/i);
    expect(state.calls.some((c) => c[0] === "createUser")).toBe(false);
    expect(state.calls.some((c) => c[1] === "provision_demo_workspace")).toBe(false);
    expect(state.calls).toContainEqual(["updateUser", "pooled-user"]);
    expect(JSON.stringify(state.calls)).not.toContain(REAL_ORG);
    expect(JSON.stringify(state.calls)).not.toContain(REAL_USER);
  });

  it("refills the pool from maintenance, not from the login response", async () => {
    state.rpc.demo_pool_available_count = () => ({ data: 0, error: null });
    state.rpc.claim_pooled_demo_workspace = () => ({ data: null, error: null });
    await runDemoMaintenance();
    expect(state.calls.some((c) => c[0] === "createUser")).toBe(true);
    const provision = state.calls.find((c) => c[1] === "provision_demo_workspace");
    expect(provision[2]).toMatchObject({ p_for_pool: true, p_client_hash: "pool" });
  });

  it("rejects the honeypot field and non-POST methods", async () => {
    let res = mockRes();
    await handleDemoStart(req({ ip: freshIp(), body: { hp: "bot" } }), res);
    expect(res.statusCode).toBe(400);
    res = mockRes();
    await handleDemoStart(req({ method: "GET", ip: freshIp() }), res);
    expect(res.statusCode).toBe(405);
  });

  it("defaults: reserved email domain, bounded TTL", () => {
    expect(demoConfig({})).toMatchObject({ enabled: true, ttlMinutes: 120, emailDomain: "example.com" });
  });
});

describe("POST /api/auth/demo-reset and /demo-end", () => {
  it("requires a valid token", async () => {
    const res = mockRes();
    await handleDemoReset(req({ token: "bad" }), res);
    expect(res.statusCode).toBe(401);
  });

  it("refuses real (non-demo) accounts", async () => {
    state.tokenUser = REAL_USER;
    const res = mockRes();
    await handleDemoReset(req({ token: "good-token" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("NOT_A_DEMO_SESSION");
    expect(state.calls.some((c) => c[1] === "reset_demo_workspace")).toBe(false);

    const end = mockRes();
    await handleDemoEnd(req({ token: "good-token" }), end);
    expect(end.statusCode).toBe(403);
    expect(state.calls.some((c) => c[0] === "deleteUser")).toBe(false);
  });

  it("resets only the caller's own workspace (body ids ignored)", async () => {
    state.tokenUser = DEMO_USER;
    const res = mockRes();
    await handleDemoReset(req({ token: "good-token", body: { user_id: REAL_USER, org_id: REAL_ORG } }), res);
    expect(res.statusCode).toBe(200);
    const call = state.calls.find((c) => c[1] === "reset_demo_workspace");
    expect(call[2]).toEqual({ p_user_id: DEMO_USER });
  });

  it("maps an expired demo to 410 without leaking database text", async () => {
    state.tokenUser = DEMO_USER;
    state.rpc.reset_demo_workspace = () => ({ data: null, error: { message: "DEMO_SESSION_EXPIRED at line 12", hint: "DEMO_SESSION_EXPIRED" } });
    const res = mockRes();
    await handleDemoReset(req({ token: "good-token" }), res);
    expect(res.statusCode).toBe(410);
    expect(res.body.error).not.toMatch(/line 12/);
  });

  it("End demo purges the workspace and deletes the demo user", async () => {
    state.tokenUser = DEMO_USER;
    const res = mockRes();
    await handleDemoEnd(req({ token: "good-token" }), res);
    expect(res.statusCode).toBe(200);
    expect(state.calls.find((c) => c[1] === "purge_demo_workspace")[2]).toEqual({ p_user_id: DEMO_USER });
    expect(state.calls).toContainEqual(["deleteUser", DEMO_USER]);
  });
});

describe("cleanup", () => {
  it("deletes each purged demo user and reports failures without throwing", async () => {
    state.rpc.purge_expired_demo_workspaces = () => ({
      data: [
        { user_id: "u1", org_id: "o1" },
        { user_id: "u2", org_id: "o2" },
      ],
      error: null,
    });
    const out = await runDemoCleanup({ limit: 10 });
    expect(out).toEqual({ purged: 2, usersDeleted: 2, failed: 0 });
    expect(state.calls.find((c) => c[1] === "purge_expired_demo_workspaces")[2]).toEqual({ p_limit: 10 });
  });
});

describe("outbound communications", () => {
  it("/api/send-email: a demo user gets a preview; nothing is sent", async () => {
    state.tokenUser = DEMO_USER;
    const res = mockRes();
    await sendEmailHandler(
      { method: "POST", headers: {}, body: { to: "someone@realperson.test", subject: "Invoice INV-1021", body: "<p>Hi</p>" } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ demo: true, sent: false, message: "Demo Mode — message not sent." });
    expect(res.body.preview).toMatchObject({ to: "someone@realperson.test", subject: "Invoice INV-1021" });
    expect(sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("/api/send-email: a real user still sends", async () => {
    state.tokenUser = REAL_USER;
    const res = mockRes();
    await sendEmailHandler(
      { method: "POST", headers: {}, body: { to: "client@realco.test", subject: "Hello", body: "<p>Hi</p>" } },
      res
    );
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    expect(res.body.success).toBe(true);
  });

  it("every server module that can send email carries a Demo Mode guard", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../server/src");
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(".") || name.startsWith("._") || name === "node_modules") continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith(".js")) files.push(full);
      }
    };
    walk(root);
    // Transport implementations, platform-admin-only mailers, and delivery helpers whose every caller is guarded.
    const allow = new Set([
      "sendInvoice.js",
      "sendInvoiceNodemailer.js",
      "pdf/InvoiceEmailPDFNode.js",
      "adminPlatformUserOutreachEmail.js",
      "adminCompanyInviteRoutes.js",
      "companyTeamInviteDelivery.js",
      "auth/paidlyAuthEmails.js",
    ]);
    const unguarded = [];
    for (const file of files) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (allow.has(rel) || rel.startsWith("demo/")) continue;
      const src = readFileSync(file, "utf8");
      const sends = /\bsendHtmlEmail\(|\bsendCompanyTeamInviteEmail\(|\bsendInvoiceEmail\(/.test(src);
      if (!sends) continue;
      if (!/isDemoUserId|isDemoOrgId|suppressForDemoOrg|isDemoMembership|membership\?\.isDemo|sendDemoRestricted|demoRestrictedError/.test(src)) {
        unguarded.push(rel);
      }
    }
    expect(unguarded).toEqual([]);
    // Payslip delivery guards inside the wrapper every payroll caller goes through.
    const payslipSender = readFileSync(path.join(root, "documents/documentSendAdapter.js"), "utf8");
    expect(payslipSender).toMatch(/export async function sendPayslipEmail[\s\S]*suppressForDemoOrg\(orgId, "payslip"\)/);
  });
});

describe("simulated payments", () => {
  const intent = (id, over = {}) => {
    const row = {
      id,
      org_id: DEMO_ORG,
      source_kind: "pos",
      provider: "card_terminal",
      status: "requires_action",
      amount: 72,
      currency: "ZAR",
      metadata: { demo_simulated: true },
      ...over,
    };
    intents.set(id, row);
    return row;
  };
  const act = async (id, body) => {
    const res = mockRes();
    await handlePaymentIntentAction({ method: "POST", params: { id }, query: {}, headers: {}, body }, res);
    return res;
  };

  beforeEach(() => {
    intents.clear();
    applied.length = 0;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER_MODE", "");
  });

  it("a demo org resolves its own simulated intent in production — through the verified-event pipeline", async () => {
    posGate.membership = { orgId: DEMO_ORG, isDemo: true };
    intent("pi-demo");
    const res = await act("pi-demo", { action: "mock", outcome: "succeeded" });
    expect(res.statusCode).toBe(200);
    expect(res.body.settlement).toMatchObject({ settled: true, sale_id: "sale-1" });
    expect(applied[0]).toMatchObject({
      intentId: "pi-demo",
      nextStatus: "paid",
      provider: "card_terminal",
      metadata: expect.objectContaining({ source: "demo_payment", demo_outcome: "succeeded", payment_kind: "DEMO_PAYMENT" }),
    });
  });

  it("failed and pending outcomes are supported; anything else is rejected", async () => {
    posGate.membership = { orgId: DEMO_ORG, isDemo: true };
    intent("pi-f");
    expect((await act("pi-f", { action: "mock", outcome: "failed" })).statusCode).toBe(200);
    intent("pi-p");
    expect((await act("pi-p", { action: "mock", outcome: "processing" })).statusCode).toBe(200);
    intent("pi-x");
    expect((await act("pi-x", { action: "mock", outcome: "refunded" })).statusCode).toBe(422);
    expect(applied.map((a) => a.nextStatus)).toEqual(["failed", "processing"]);
  });

  it("a real business can never mock a payment in production", async () => {
    posGate.membership = { orgId: REAL_ORG, isDemo: false };
    intent("pi-real", { org_id: REAL_ORG, metadata: { demo_simulated: true } });
    const res = await act("pi-real", { action: "mock", outcome: "succeeded" });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("MOCK_NOT_ENABLED");
    expect(applied).toEqual([]);
  });

  it("a demo org cannot mock an intent that is not a demo simulation", async () => {
    posGate.membership = { orgId: DEMO_ORG, isDemo: true };
    intent("pi-cash", { provider: "cash", metadata: {} });
    expect((await act("pi-cash", { action: "mock", outcome: "succeeded" })).statusCode).toBe(403);
    intent("pi-online", { provider: "ozow", metadata: { demo_simulated: true } });
    expect((await act("pi-online", { action: "mock", outcome: "succeeded" })).statusCode).toBe(403);
  });

  it("another org's intent id is not found (no cross-tenant mocking)", async () => {
    posGate.membership = { orgId: DEMO_ORG, isDemo: true };
    intent("pi-other", { org_id: REAL_ORG });
    expect((await act("pi-other", { action: "mock", outcome: "succeeded" })).statusCode).toBe(404);
  });

  it("the card terminal adapter hands a demo intent to the in-app simulator — no Paidly Pay URL, no provider", async () => {
    const charge = await cardTerminalProvider.createCharge({ id: "pi-9", metadata: { demo_simulated: true } }, {});
    expect(charge.status).toBe("requires_action");
    expect(charge.next_action).toMatchObject({ type: "demo", demo: true, open_url: null, redirect_url: null, payment_intent_id: "pi-9" });
  });

  it("shared contract: SUCCESS / FAILED / PENDING, clearly labelled as simulated", () => {
    expect(demoPayments.DEMO_PAYMENT).toBe("DEMO_PAYMENT");
    expect(demoPayments.DEMO_PAYMENT_OUTCOMES.map((o) => o.status)).toEqual(["SUCCESS", "FAILED", "PENDING"]);
    expect(demoPayments.DEMO_PAYMENT_OUTCOMES.map((o) => o.label)).toEqual([
      "Demo Payment Successful",
      "Demo Payment Failed",
      "Demo Payment Pending",
    ]);
    expect(demoPayments.DEMO_PAYMENT_NOTICE).toMatch(/no money moves/i);
    expect(demoPayments.isDemoNextAction({ type: "redirect", redirect_url: "https://pay.ozow.com" })).toBe(false);
  });
});
