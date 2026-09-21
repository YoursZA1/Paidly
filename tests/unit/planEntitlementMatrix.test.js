/**
 * Package → subscription → entitlement → access → limits → UI must agree.
 * Subscription is the only source; profiles.plan never changes the answer.
 * See docs/PLAN_ENTITLEMENT_AUDIT.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables } = vi.hoisted(() => {
  const tables = { subscriptions: [], profiles: [], memberships: [], organizations: [], company_invites: [], subscription_events: [], audit_logs: [] };

  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "neq") return String(v ?? "") !== String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    if (f.op === "notnull") return v != null;
    return true;
  };

  const memory = {
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: { id, email: `${id.slice(0, 4)}@example.com` } }, error: null }),
      },
    },
    from(table) {
      const st = { action: "select", payload: null, filters: [], order: null, limit: null, head: false };
      const rowsNow = () => (tables[table] || []).filter((r) => st.filters.every((f) => matches(r, f)));
      const run = () => {
        if (st.action === "insert") {
          const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: randomUUID(), ...r }));
          tables[table].push(...list);
          return { data: list, error: null };
        }
        if (st.action === "update") {
          const found = rowsNow();
          found.forEach((r) => Object.assign(r, st.payload));
          return { data: found, error: null };
        }
        let rows = rowsNow();
        if (st.head) return { data: null, count: rows.length, error: null };
        if (st.order) {
          const { col, asc } = st.order;
          rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return { data: rows, error: null };
      };
      const api = {
        select(_cols, opts) {
          if (opts?.head) st.head = true;
          if (st.action === "select") st.action = "select";
          return api;
        },
        insert(p) { st.action = "insert"; st.payload = p; return api; },
        update(p) { st.action = "update"; st.payload = p; return api; },
        eq(col, value) { st.filters.push({ op: "eq", col, value }); return api; },
        neq(col, value) { st.filters.push({ op: "neq", col, value }); return api; },
        in(col, value) { st.filters.push({ op: "in", col, value }); return api; },
        not(col) { st.filters.push({ op: "notnull", col }); return api; },
        order(col, opts) { st.order = { col, asc: opts?.ascending !== false }; return api; },
        limit(n) { st.limit = n; return api; },
        async maybeSingle() { const r = run(); return { data: (r.data || [])[0] || null, error: null }; },
        async single() { const r = run(); return { data: (r.data || [])[0] || null, error: null }; },
        then(resolve) { return resolve(run()); },
      };
      return api;
    },
  };
  return { memory, tables };
});

vi.mock("../../server/src/billing/supabaseAdmin.js", () => ({ getBillingSupabaseAdmin: () => memory }));
vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory, default: memory }));

import { buildEntitlementSnapshot, resolveEntitlement } from "../../server/src/billing/entitlements.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../../server/src/featureGate.js";
import { handleAdminSetCompanyPlan } from "../../server/src/billing/adminBillingApi.js";
import { checkCompanyInviteSeat } from "../../server/src/companyTeamRoutes.js";
import {
  clientHasFeature,
  deriveEntitlementFromSubscriptionCurrent,
  describeEntitlementBadge,
  isEntitlementLapsed,
} from "../../src/lib/clientEntitlement.js";
import { getRequiredPlan } from "../../src/components/subscription/FeatureGate.jsx";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

function seed({ plan, status = "active", trialEndsInMs = null, extra = {} }) {
  tables.organizations.push({ id: COMPANY, owner_id: OWNER, created_at: iso(-30 * DAY) });
  const row = {
    id: randomUUID(),
    company_id: COMPANY,
    user_id: OWNER,
    status,
    plan,
    plan_family: plan,
    plan_slug: `${plan}_monthly`,
    billing_cycle: "monthly",
    trial_started_at: trialEndsInMs != null ? iso(trialEndsInMs - 7 * DAY) : null,
    trial_ends_at: trialEndsInMs != null ? iso(trialEndsInMs) : null,
    admin_override: false,
    subscription_source: status === "trialing" ? "system_trial" : "payfast",
    updated_at: iso(-DAY),
    created_at: iso(-10 * DAY),
    ...extra,
  };
  tables.subscriptions.push(row);
  return row;
}

async function entitlementFor(userId = OWNER) {
  return buildEntitlementSnapshot(await resolveEntitlement(memory, userId));
}

/** What the UI derives from GET /api/subscriptions/current for the same company. */
async function uiFor(userId = OWNER) {
  return deriveEntitlementFromSubscriptionCurrent({ entitlement: await entitlementFor(userId) });
}

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k] = [];
});

const PLANS = ["starter", "business", "growth"];
const TOP_FEATURE = { starter: "invoices", business: "payslips", growth: "api_access" };
const SEATS = { starter: 1, business: 5, growth: null };

describe("package × lifecycle matrix (server resolver = UI snapshot)", () => {
  for (const plan of PLANS) {
    it(`${plan} trial grants ${plan} entitlements`, async () => {
      seed({ plan, status: "trialing", trialEndsInMs: 5 * DAY });
      const e = await entitlementFor();
      expect(e).toMatchObject({ plan, accessGranted: true, trialing: true, trialDaysRemaining: 5 });
      expect(e.features).toContain(TOP_FEATURE[plan]);
      expect(e.limits.seats).toBe(SEATS[plan]);
      const ui = await uiFor();
      expect(clientHasFeature(TOP_FEATURE[plan], { snapshot: ui })).toBe(true);
      expect(describeEntitlementBadge(ui)).toMatchObject({ plan, statusLabel: "Trial — 5 days left" });
    });

    it(`${plan} active grants ${plan} entitlements only`, async () => {
      seed({ plan, status: "active" });
      const e = await entitlementFor();
      expect(e).toMatchObject({ plan, accessGranted: true, trialing: false });
      expect(e.limits.seats).toBe(SEATS[plan]);
      const ui = await uiFor();
      expect(describeEntitlementBadge(ui).statusLabel).toBe("Active");
      const higher = { starter: "payslips", business: "api_access", growth: "sso" }[plan];
      expect(e.features).not.toContain(higher);
      expect(clientHasFeature(higher, { snapshot: ui })).toBe(false);
    });

    it(`${plan} trial past its end date: no access, still reported as ${plan} (not Free/Starter)`, async () => {
      seed({ plan, status: "trialing", trialEndsInMs: -DAY });
      const e = await entitlementFor();
      expect(e).toMatchObject({ plan, accessGranted: false, features: [] });
      const ui = await uiFor();
      expect(describeEntitlementBadge(ui)).toMatchObject({ plan, statusLabel: "Trial expired" });
      expect(isEntitlementLapsed(ui)).toBe(true);
      expect(clientHasFeature("invoices", { snapshot: ui })).toBe(false);
    });

    it(`${plan} expired`, async () => {
      seed({ plan, status: "expired" });
      const ui = await uiFor();
      expect(ui).toMatchObject({ subscribedPlan: plan, accessGranted: false });
      expect(isEntitlementLapsed(ui)).toBe(true);
    });
  }

  it("no subscription → no package, not locked (legacy account)", async () => {
    tables.organizations.push({ id: COMPANY, owner_id: OWNER, created_at: iso(-DAY) });
    const ui = await uiFor();
    expect(describeEntitlementBadge(ui).planLabel).toBe("No subscription");
    expect(isEntitlementLapsed(ui)).toBe(false);
  });
});

describe("profiles.plan never decides access", () => {
  it("profile starter + subscription growth → growth", async () => {
    seed({ plan: "growth" });
    tables.profiles.push({ id: OWNER, plan: "starter", subscription_plan: "starter" });
    expect((await entitlementFor()).plan).toBe("growth");
    await expect(assertUserHasFeature(memory, OWNER, "api_access")).resolves.toBeUndefined();
  });

  it("profile growth + subscription starter → starter; Growth-only feature rejected server-side", async () => {
    seed({ plan: "starter" });
    tables.profiles.push({ id: OWNER, plan: "growth", subscription_plan: "growth", is_pro: true });
    expect((await entitlementFor()).plan).toBe("starter");
    await expect(assertUserHasFeature(memory, OWNER, "api_access")).rejects.toBeInstanceOf(UpgradeRequiredError);
  });

  it("the screenshot case: profile growth, only an expired starter trial + pending growth checkout", async () => {
    seed({ plan: "starter", status: "trialing", trialEndsInMs: -2 * DAY });
    tables.subscriptions.push({
      id: randomUUID(), company_id: COMPANY, user_id: OWNER, status: "pending",
      plan: "growth", plan_family: "growth", plan_slug: "growth_monthly", updated_at: iso(0),
    });
    tables.profiles.push({ id: OWNER, plan: "growth" });
    const ui = await uiFor();
    expect(ui.accessGranted).toBe(false);
    expect(describeEntitlementBadge(ui)).toMatchObject({ plan: "growth", statusLabel: "Awaiting payment" });
    expect(clientHasFeature("reports_basic", { snapshot: ui })).toBe(false);
  });

  it("members inherit the company package", async () => {
    seed({ plan: "growth" });
    const MEMBER = randomUUID();
    tables.memberships.push({ org_id: COMPANY, user_id: MEMBER, created_at: iso(0) });
    tables.profiles.push({ id: MEMBER, plan: "free" });
    expect((await entitlementFor(MEMBER)).plan).toBe("growth");
  });

  it("the client snapshot has no profile input at all (loading → not ready, no lock flash)", () => {
    const e = deriveEntitlementFromSubscriptionCurrent(null);
    expect(e.ready).toBe(false);
    expect(e.planSlug).toBeNull();
    expect(clientHasFeature("api_access", { snapshot: e })).toBe(true);
  });
});

function resMock() {
  const out = { status: 0, body: null };
  const res = {
    statusCode: 200,
    setHeader() {},
    status(c) { out.status = c; return res; },
    json(b) { out.body = b; return res; },
    end(b) { out.body = typeof b === "string" ? JSON.parse(b) : b; return res; },
  };
  return { res, out };
}

describe("admin package changes update the subscription, entitlements follow immediately", () => {
  const change = async (plan) => {
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, { id: randomUUID(), email: "admin@paidly" }, { user_id: OWNER, plan });
  };

  it.each([
    ["starter", "business"],
    ["business", "growth"],
    ["growth", "business"],
    ["business", "starter"],
  ])("%s → %s", async (from, to) => {
    seed({ plan: from, status: "active" });
    await change(to);
    expect(tables.subscriptions).toHaveLength(1); // changed in place, no second row
    expect(tables.subscriptions[0]).toMatchObject({ plan_family: to, admin_override: true });
    const e = await entitlementFor();
    expect(e.plan).toBe(to);
    expect(e.features.includes("api_access")).toBe(to === "growth");
    expect(tables.audit_logs.length).toBe(1);
  });

  it("lapsed trial + admin grant → active on the new package", async () => {
    seed({ plan: "starter", status: "trialing", trialEndsInMs: -DAY });
    await change("growth");
    expect(await entitlementFor()).toMatchObject({ plan: "growth", accessGranted: true });
  });

  it("company without a subscription gets one admin-managed row", async () => {
    tables.organizations.push({ id: COMPANY, owner_id: OWNER, created_at: iso(-DAY) });
    await change("business");
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0]).toMatchObject({ company_id: COMPANY, plan_family: "business", status: "active" });
    expect((await entitlementFor()).plan).toBe("business");
  });

  it("plan none removes access", async () => {
    seed({ plan: "growth", status: "active", extra: { subscription_source: "admin", admin_override: true } });
    await change("none");
    expect((await entitlementFor()).accessGranted).toBe(false);
  });
});

describe("seat limits come from the company plan", () => {
  const addMembers = (n, { login = true } = {}) => {
    for (let i = 0; i < n; i++) {
      tables.memberships.push({ org_id: COMPANY, user_id: login ? randomUUID() : null, created_at: iso(0) });
    }
  };

  it("Business: 1 and 5 users fine, 6th rejected", async () => {
    seed({ plan: "business" });
    addMembers(1);
    expect(await checkCompanyInviteSeat(COMPANY, "new@x.co")).toBeNull();
    addMembers(3); // 4 members
    expect(await checkCompanyInviteSeat(COMPANY, "fifth@x.co")).toBeNull();
    addMembers(1); // 5 members
    const block = await checkCompanyInviteSeat(COMPANY, "sixth@x.co");
    expect(block).toMatchObject({ status: 409, extra: { code: "SEAT_LIMIT_REACHED", seats: 5 } });
  });

  it("employees without a login are not seats", async () => {
    seed({ plan: "business" });
    addMembers(2);
    addMembers(20, { login: false });
    expect(await checkCompanyInviteSeat(COMPANY, "new@x.co")).toBeNull();
  });

  it("pending invites count as seats", async () => {
    seed({ plan: "business" });
    addMembers(4);
    tables.company_invites.push({ org_id: COMPANY, email: "p@x.co", status: "pending" });
    expect(await checkCompanyInviteSeat(COMPANY, "other@x.co")).toMatchObject({ status: 409 });
  });

  it("Growth: unlimited", async () => {
    seed({ plan: "growth" });
    addMembers(40);
    expect(await checkCompanyInviteSeat(COMPANY, "new@x.co")).toBeNull();
  });

  it("Starter: 1 user (the owner)", async () => {
    seed({ plan: "starter" });
    addMembers(1);
    expect(await checkCompanyInviteSeat(COMPANY, "new@x.co")).toMatchObject({ status: 409 });
  });
});

describe("stale cache: a new /subscriptions/current payload replaces the whole snapshot", () => {
  it("Growth → Business while logged in", async () => {
    seed({ plan: "growth" });
    const before = await uiFor();
    expect(clientHasFeature("api_access", { snapshot: before })).toBe(true);
    tables.subscriptions[0].plan_family = "business";
    tables.subscriptions[0].plan_slug = "business_monthly";
    const after = await uiFor();
    expect(clientHasFeature("api_access", { snapshot: after })).toBe(false);
    expect(describeEntitlementBadge(after).planLabel).toBe("Business");
  });
});

describe("required-plan labels come from the shared catalog", () => {
  it.each([
    ["cashflow", "Starter"],
    ["invoices", "Starter"],
    ["pos", "Business"],
    ["payroll", "Business"],
    ["recurring", "Business"],
    ["leave_management", "Growth"],
    ["apiAccess", "Growth"],
    ["multi_company", "Growth"],
    ["customBranding", "Enterprise"],
  ])("%s → %s", (feature, plan) => {
    expect(getRequiredPlan(feature)).toBe(plan);
  });
});
