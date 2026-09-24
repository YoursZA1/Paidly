/**
 * Day 2 — subscription truth & entitlement enforcement.
 *
 *  §19 matrix   every subscription state × profiles.plan × critical paid feature: the server gate
 *               (assertUserHasFeature), the HTTP gate (requireFeature) and the UI snapshot
 *               (/api/subscriptions/current → clientHasFeature) must all give the same answer, and
 *               profiles.plan must never change it.
 *  §15/16       entitlement is the company's: members inherit it; a member's own subscription, another
 *               company's subscription, or client-supplied company ids never apply.
 *  §20          billing mutations (checkout / change / cancel) are owner-only, like the SPA.
 *  §17          UI-gated Growth API (organogram) is server-gated too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables, users } = vi.hoisted(() => {
  const tables = {};
  /** token → user id */
  const users = new Map();

  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "neq") return String(v ?? "") !== String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    if (f.op === "is") return f.value === null ? v == null : v === f.value;
    if (f.op === "notnull") return v != null;
    return true;
  };

  const memory = {
    auth: {
      async getUser(token) {
        const id = users.get(token);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "bad token" } };
      },
    },
    async rpc() {
      return { data: null, error: { message: "rpc not available in test" } };
    },
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [], order: null, limit: null };
      const rows = () => tables[table].filter((r) => st.filters.every((f) => matches(r, f)));
      const run = () => {
        if (st.action === "insert") {
          const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: randomUUID(), ...r }));
          tables[table].push(...list);
          return list;
        }
        let found = rows();
        if (st.action === "update") {
          found.forEach((r) => Object.assign(r, st.payload));
          return found;
        }
        if (st.order) {
          const { col, asc } = st.order;
          found = [...found].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        return st.limit != null ? found.slice(0, st.limit) : found;
      };
      const api = {
        select() {
          return api;
        },
        insert(payload) {
          st.action = "insert";
          st.payload = payload;
          return api;
        },
        update(payload) {
          st.action = "update";
          st.payload = payload;
          return api;
        },
        eq: (col, value) => (st.filters.push({ op: "eq", col, value }), api),
        neq: (col, value) => (st.filters.push({ op: "neq", col, value }), api),
        in: (col, value) => (st.filters.push({ op: "in", col, value }), api),
        is: (col, value) => (st.filters.push({ op: "is", col, value }), api),
        not: (col) => (st.filters.push({ op: "notnull", col }), api),
        order: (col, opts) => ((st.order = { col, asc: opts?.ascending !== false }), api),
        limit: (n) => ((st.limit = n), api),
        async maybeSingle() {
          return { data: run()[0] || null, error: null };
        },
        async single() {
          const r = run()[0];
          return r ? { data: r, error: null } : { data: null, error: { message: "no rows" } };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { memory, tables, users };
});

vi.mock("../../server/src/billing/supabaseAdmin.js", () => ({ getBillingSupabaseAdmin: () => memory }));
vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));

// Workforce route: auth/RBAC is covered elsewhere; here the member is already authorized by role.
const workforceGate = vi.hoisted(() => ({ current: null }));
vi.mock("../../server/src/workforce/workforceAuth.js", () => ({
  requireWorkforcePermission: async () => workforceGate.current,
}));
vi.mock("../../server/src/workforce/employeeService.js", () => {
  const stub = async () => ({});
  return {
    createEmployee: stub,
    getEmployee: stub,
    getEmployeeProfile: stub,
    getEmployeePortalLink: stub,
    inviteEmployeePortal: stub,
    listEmployees: stub,
    listEligibleManagers: stub,
    reassignManagerReports: stub,
    resetEmployeePosPin: stub,
    revokeEmployeePortalAccess: stub,
    updateEmployee: stub,
    workforceSummary: stub,
    getWorkforceOrganogram: async () => ({ departments: [{ name: "Sales", managers: [] }] }),
    getPeopleCalendar: stub,
  };
});

import { assertUserHasFeature, UpgradeRequiredError } from "../../server/src/featureGate.js";
import {
  buildEntitlementSnapshot,
  requireFeature,
  resolveEntitlement,
} from "../../server/src/billing/entitlements.js";
import {
  handleSubscriptionCancel,
  handleSubscriptionChange,
  handleSubscriptionCreate,
} from "../../server/src/billing/subscriptionApi.js";
import { handleWorkforceEmployees } from "../../server/src/workforce/workforceRoutes.js";
import { upsertSubscriptionFromItn } from "../../server/src/payfastSubscriptionItn.js";
import { PAST_DUE_GRACE_DAYS } from "../../shared/subscriptionAccess.js";
import { clientHasFeature, deriveEntitlementFromSubscriptionCurrent } from "@/lib/clientEntitlement";
import { canonicalFeatureKey } from "@/components/subscription/FeatureGate";

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  users.clear();
}

/** A company with an owner; returns ids. */
function seedCompany() {
  const owner = randomUUID();
  const org = randomUUID();
  tables.organizations = [...(tables.organizations || []), { id: org, owner_id: owner, created_at: iso(-10 * DAY) }];
  tables.memberships = [...(tables.memberships || [])];
  tables.profiles = [...(tables.profiles || []), { id: owner, plan: "none", subscription_plan: "none" }];
  users.set(`tok-${owner}`, owner);
  return { owner, org };
}

function addMember(org, role = "employee") {
  const id = randomUUID();
  tables.memberships.push({ id: randomUUID(), org_id: org, user_id: id, role, created_at: iso(-DAY) });
  tables.profiles.push({ id, plan: "none", subscription_plan: "none" });
  users.set(`tok-${id}`, id);
  return id;
}

function setProfilePlan(userId, plan) {
  const p = tables.profiles.find((r) => r.id === userId);
  Object.assign(p, { plan, subscription_plan: plan, subscription_status: "active", is_pro: true });
}

function addSubscription(partial) {
  const row = {
    id: randomUUID(),
    status: "active",
    plan_slug: "business_monthly",
    plan_family: "business",
    admin_override: false,
    subscription_source: "payfast",
    updated_at: iso(0),
    created_at: iso(-DAY),
    ...partial,
  };
  tables.subscriptions = [...(tables.subscriptions || []), row];
  return row;
}

async function serverAllows(userId, feature) {
  try {
    await assertUserHasFeature(memory, userId, feature);
    return true;
  } catch (err) {
    if (err instanceof UpgradeRequiredError) return false;
    throw err;
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
    setHeader(k, v) {
      res.headers[k] = v;
    },
    end() {
      return res;
    },
  };
  return res;
}

async function httpAllows(userId, feature, extraReq = {}) {
  const res = mockRes();
  const ok = await requireFeature({ headers: { authorization: `Bearer tok-${userId}` }, url: "/x", ...extraReq }, res, feature);
  return { ok, status: ok ? 200 : res.statusCode, code: res.body?.code || null };
}

/** What the SPA sees: /api/subscriptions/current `entitlement` → clientHasFeature. */
async function uiAllows(userId, feature) {
  const ent = await resolveEntitlement(memory, userId);
  const snapshot = deriveEntitlementFromSubscriptionCurrent({ entitlement: buildEntitlementSnapshot(ent) });
  return clientHasFeature(feature, { snapshot });
}

beforeEach(() => {
  reset();
  vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "true");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §19 matrix
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Subscription state on a Business package (null = no subscription at all, the "Free" case). */
const STATES = {
  free: null,
  trial: { status: "trialing", trial_ends_at: iso(3 * DAY), subscription_source: "system_trial" },
  trial_expired: { status: "trialing", trial_ends_at: iso(-DAY), subscription_source: "system_trial" },
  paid: { status: "active", current_period_end: iso(20 * DAY) },
  expired: { status: "expired" },
  cancelled_in_period: { status: "cancelled", current_period_end: iso(10 * DAY), cancelled_at: iso(-DAY) },
  cancelled_ended: { status: "cancelled", current_period_end: iso(-DAY), cancelled_at: iso(-30 * DAY) },
  past_due_in_grace: { status: "past_due", grace_ends_at: iso(5 * DAY) },
  past_due_grace_over: { status: "past_due", grace_ends_at: iso(-DAY) },
  past_due_no_grace: { status: "past_due", grace_ends_at: null },
  suspended: { status: "suspended" },
  pending_checkout: { status: "pending" },
};

const GRANTS_ACCESS = new Set(["trial", "paid", "cancelled_in_period", "past_due_in_grace"]);

/** Business package: Starter + Business features on; Growth (departments) off. */
const FEATURES = [
  ["payslips", "starter"],
  ["payroll", "business"],
  ["leave_management", "business"],
  ["pos", "business"],
  ["departments", "growth"],
];

const PROFILE_PLANS = ["none", "starter", "business", "growth", "expired"];

const MATRIX = [];
for (const [state, sub] of Object.entries(STATES)) {
  for (const profilePlan of PROFILE_PLANS) {
    for (const [feature, tier] of FEATURES) {
      const expected = GRANTS_ACCESS.has(state) && tier !== "growth";
      MATRIX.push([state, profilePlan, feature, expected, sub]);
    }
  }
}

describe("§19 matrix — subscription decides, profiles.plan never does", () => {
  it.each(MATRIX)("%s sub + profiles.plan=%s → %s allowed=%s", async (state, profilePlan, feature, expected, sub) => {
    const { owner, org } = seedCompany();
    setProfilePlan(owner, profilePlan);
    if (sub) addSubscription({ user_id: owner, company_id: org, ...sub });

    expect(await serverAllows(owner, feature)).toBe(expected);
    const http = await httpAllows(owner, feature);
    expect(http.ok).toBe(expected);
    if (!expected) {
      expect(http).toMatchObject(
        GRANTS_ACCESS.has(state)
          ? { status: 403, code: "PLAN_UPGRADE_REQUIRED" }
          : { status: 402, code: "SUBSCRIPTION_REQUIRED" }
      );
    }
    // §17: the UI shows exactly what the server allows (no LOCKED-but-allowed, no AVAILABLE-but-blocked).
    expect(await uiAllows(owner, feature)).toBe(expected);
  });

  it("Paid Growth + profiles.plan=starter → Growth features available (subscription wins upward too)", async () => {
    const { owner, org } = seedCompany();
    setProfilePlan(owner, "starter");
    addSubscription({ user_id: owner, company_id: org, plan_slug: "growth_monthly", plan_family: "growth" });
    expect(await serverAllows(owner, "departments")).toBe(true);
    expect(await uiAllows(owner, "departments")).toBe(true);
  });

  it("expired account keeps its package name for the UI but no features (not treated as 'Free')", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org, status: "expired", plan_slug: "growth_monthly", plan_family: "growth" });
    const snap = buildEntitlementSnapshot(await resolveEntitlement(memory, owner));
    expect(snap).toMatchObject({ plan: "growth", accessGranted: false, features: [], status: "expired" });
    expect(snap.limits).toEqual({ seats: 0, companies: 0, payslipEmployees: 0 });
  });

  it("trial: allowed before trial_ends_at, denied after — and the row is flipped to expired", async () => {
    const { owner, org } = seedCompany();
    const row = addSubscription({ user_id: owner, company_id: org, status: "trialing", trial_ends_at: iso(60_000) });
    expect(await serverAllows(owner, "payroll")).toBe(true);
    row.trial_ends_at = iso(-60_000);
    expect(await serverAllows(owner, "payroll")).toBe(false);
    expect(row.status).toBe("expired");
  });

  it("report-only mode (PAIDLY_ENTITLEMENTS_ENFORCE=false) logs instead of blocking — requireFeature only", async () => {
    vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "false");
    const { owner } = seedCompany();
    expect((await httpAllows(owner, "pos")).ok).toBe(true);
    // assertUserHasFeature (payroll, leave, email templates, organogram) always enforces.
    expect(await serverAllows(owner, "payroll")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §15 / §16 multi-user company + isolation
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§15/16 — the company's subscription, and only that", () => {
  it.each(["employee", "manager", "admin"])("%s of a paid Business company inherits its entitlement", async (role) => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org });
    const member = addMember(org, role);
    expect(await serverAllows(member, "leave_management")).toBe(true);
    expect(await serverAllows(member, "departments")).toBe(false);
  });

  it("a member's personal, company-less paid subscription does not unlock an unpaid employer", async () => {
    const { org } = seedCompany();
    const member = addMember(org, "admin");
    setProfilePlan(member, "growth");
    addSubscription({ user_id: member, company_id: null, plan_slug: "growth_monthly", plan_family: "growth" });

    const ent = await resolveEntitlement(memory, member);
    expect(ent).toMatchObject({ companyId: org, access: false, family: null });
    expect(await serverAllows(member, "payroll")).toBe(false);
    expect(await uiAllows(member, "payroll")).toBe(false);
  });

  it("the owner's company-less (legacy ITN) row still counts for every member", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: null });
    const member = addMember(org);
    expect(await serverAllows(member, "payroll")).toBe(true);
  });

  it("another company's paid subscription never applies; client-supplied company ids are ignored", async () => {
    const paid = seedCompany();
    addSubscription({ user_id: paid.owner, company_id: paid.org, plan_slug: "growth_monthly", plan_family: "growth" });
    const unpaid = seedCompany();

    const attempt = await httpAllows(unpaid.owner, "pos", {
      url: `/api/pos/registers?companyId=${paid.org}&company_id=${paid.org}`,
      query: { companyId: paid.org, company_id: paid.org, org_id: paid.org },
      headers: { authorization: `Bearer tok-${unpaid.owner}`, "x-company-id": paid.org, "x-org-id": paid.org },
      body: { company_id: paid.org, plan: "growth", status: "active" },
    });
    expect(attempt).toMatchObject({ ok: false, status: 402, code: "SUBSCRIPTION_REQUIRED" });
  });

  it("no bearer token → 401, never a default entitlement", async () => {
    const res = mockRes();
    expect(await requireFeature({ headers: {}, url: "/x" }, res, "pos")).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §20 billing mutations are owner-only (SPA: Billing & Invoices is RequireBusinessOwner)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§20 — only the company owner can start, change or cancel the company subscription", () => {
  const post = (userId, body = {}) => ({
    method: "POST",
    headers: { authorization: `Bearer tok-${userId}` },
    body,
    query: {},
  });
  const checkoutBody = {
    planSlug: "business_monthly",
    returnUrl: "https://www.paidly.co.za/return",
    cancelUrl: "https://www.paidly.co.za/cancel",
  };

  it.each(["employee", "manager", "admin"])("%s cannot cancel the company subscription", async (role) => {
    const { owner, org } = seedCompany();
    const sub = addSubscription({ user_id: owner, company_id: org });
    const member = addMember(org, role);

    const byDefault = mockRes();
    await handleSubscriptionCancel(post(member), byDefault);
    expect(byDefault.statusCode).toBe(404); // the company's agreement is not reachable at all

    const byId = mockRes();
    await handleSubscriptionCancel(post(member, { subscriptionId: sub.id }), byId);
    expect(byId.statusCode).toBe(403);
    expect(byId.body.code).toBe("BILLING_OWNER_REQUIRED");
    expect(sub.status).toBe("active");
  });

  it("owner can cancel it", async () => {
    const { owner, org } = seedCompany();
    const sub = addSubscription({ user_id: owner, company_id: org });
    const res = mockRes();
    await handleSubscriptionCancel(post(owner), res);
    expect(res.statusCode).toBe(200);
    expect(sub.status).toBe("cancelled");
  });

  it("a member can still cancel an agreement they pay for themselves", async () => {
    const { org } = seedCompany();
    const member = addMember(org);
    const own = addSubscription({ user_id: member, company_id: org });
    const res = mockRes();
    await handleSubscriptionCancel(post(member, { subscriptionId: own.id }), res);
    expect(res.statusCode).toBe(200);
  });

  it("member cannot start a checkout or change the plan for the employer", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org, payfast_token: "tok-agreement" });
    const member = addMember(org, "admin");

    const create = mockRes();
    await handleSubscriptionCreate(post(member, checkoutBody), create);
    expect(create.statusCode).toBe(403);
    expect(create.body.code).toBe("BILLING_OWNER_REQUIRED");

    const change = mockRes();
    await handleSubscriptionChange(post(member, { planSlug: "growth_monthly" }), change);
    expect(change.statusCode).toBe(403);
    expect(change.body.code).toBe("BILLING_OWNER_REQUIRED");
  });

  it("owner passes the ownership check on checkout", async () => {
    const { owner } = seedCompany();
    const res = mockRes();
    await handleSubscriptionCreate(post(owner, checkoutBody), res);
    expect(res.body?.code).not.toBe("BILLING_OWNER_REQUIRED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §17 UI-locked Growth feature is locked at the API too
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§17 — organogram API follows the Growth 'departments' gate", () => {
  async function organogramAs(userId, org) {
    workforceGate.current = { ok: true, user: { id: userId }, membership: { id: randomUUID(), companyId: org, orgId: org, companyRole: "admin" } };
    const res = mockRes();
    await handleWorkforceEmployees({ method: "GET", query: { path: ["workforce-organogram"] }, url: "/api/company/workforce-organogram", headers: {} }, res);
    return res;
  }

  it("Business company → 403 UPGRADE_REQUIRED (was 200)", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org });
    const res = await organogramAs(owner, org);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "UPGRADE_REQUIRED", feature: "departments" });
  });

  it("expired Growth company → 403", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org, status: "expired", plan_slug: "growth_monthly", plan_family: "growth" });
    expect((await organogramAs(owner, org)).statusCode).toBe(403);
  });

  it("paid Growth company → 200 with data", async () => {
    const { owner, org } = seedCompany();
    addSubscription({ user_id: owner, company_id: org, plan_slug: "growth_monthly", plan_family: "growth" });
    const res = await organogramAs(owner, org);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.departments).toHaveLength(1);
  });
});

describe("§17 — sidebar nav keys resolve like <FeatureGate> (Cash Flow / Reports)", () => {
  const snap = (plan, accessGranted = true) => ({ ready: true, accessGranted, planSlug: plan, planFamily: plan });

  it.each(["cashflow", "reports"])("%s: available on every paid plan, locked without access", (navKey) => {
    // Before: the nav passed the UI key straight to clientHasFeature → unknown key → locked for all.
    expect(clientHasFeature(navKey, { snapshot: snap("growth") })).toBe(false);
    for (const plan of ["starter", "business", "growth"]) {
      expect(clientHasFeature(canonicalFeatureKey(navKey), { snapshot: snap(plan) })).toBe(true);
    }
    expect(clientHasFeature(canonicalFeatureKey(navKey), { snapshot: snap("growth", false) })).toBe(false);
  });

  it("Layout's nav check resolves aliases", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/pages/Layout.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/entitlementHasFeature\(canonicalFeatureKey\(feature\)\)/);
  });
});

describe("§13 — a failed PayFast renewal keeps access for the same grace as the dunning cron", () => {
  const itn = (row, owner, org, payment_status) =>
    upsertSubscriptionFromItn(
      memory,
      { payment_status, m_payment_id: row.m_payment_id, custom_str2: "business_monthly", item_name: "Business" },
      { subscriptionIdHint: row.id, userIdHint: owner, companyIdHint: org, planSlugHint: "business_monthly" }
    );

  it("FAILED → past_due with a 7-day grace (access kept); COMPLETE clears it; 3rd failure → cancelled", async () => {
    const { owner, org } = seedCompany();
    const row = addSubscription({
      user_id: owner,
      company_id: org,
      m_payment_id: "sub_x",
      current_period_end: iso(-60_000), // renewal date just passed
      max_retry_attempts: 3,
    });

    await itn(row, owner, org, "FAILED");
    expect(row.status).toBe("past_due");
    const graceDays = (new Date(row.grace_ends_at).getTime() - Date.now()) / DAY;
    expect(graceDays).toBeGreaterThan(PAST_DUE_GRACE_DAYS - 0.01);
    expect(graceDays).toBeLessThanOrEqual(PAST_DUE_GRACE_DAYS);
    expect(await serverAllows(owner, "payroll")).toBe(true); // was: immediate lockout

    await itn(row, owner, org, "COMPLETE");
    expect(row).toMatchObject({ status: "active", grace_ends_at: null, failure_count: 0 });

    row.current_period_end = iso(-60_000);
    for (let i = 0; i < 3; i += 1) await itn(row, owner, org, "FAILED");
    expect(row).toMatchObject({ status: "cancelled", grace_ends_at: null });
    expect(await serverAllows(owner, "payroll")).toBe(false);
  });

  it("the dunning cron uses the same constant", async () => {
    const { readFileSync } = await import("node:fs");
    const cron = readFileSync(new URL("../../api/cron.js", import.meta.url), "utf8");
    expect(cron).toMatch(/addCalendarDaysIso\(new Date\(\), PAST_DUE_GRACE_DAYS\)/);
    expect(cron).not.toMatch(/7 \* 24 \* 60 \* 60 \* 1000/);
  });
});
