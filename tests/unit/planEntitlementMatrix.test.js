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
    if (f.op === "is") return f.value === null ? v == null : v === f.value;
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
        is(col, value) { st.filters.push({ op: "is", col, value }); return api; },
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
import { getRequiredPlan, getUpgradeTarget } from "../../src/components/subscription/FeatureGate.jsx";
import { buildAdminOverridePatch } from "../../server/src/billing/adminSubscriptionOverride.js";
import { upsertSubscriptionFromItn } from "../../server/src/payfastSubscriptionItn.js";
import { assertPayrollEmployeeCapacity } from "../../server/src/payroll/payrollEmployeeLimit.js";
import {
  FAMILY_FEATURES,
  FAMILY_LIMITS,
  familyHasFeature,
  getFeatureLimit,
  getPlanEntitlements,
  lowestFamilyAllowing,
  payslipEmployeeKey,
  requiredTierForFeature,
} from "../../shared/planFeatures.js";
import { planGuardErrorFromSupabase } from "../../src/api/entity/EntityManager.js";
import { readFileSync } from "node:fs";

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
const TOP_FEATURE = { starter: "payslips", business: "leave_management", growth: "api_access" };
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
      const higher = { starter: "inventory", business: "api_access", growth: "sso" }[plan];
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
    ["payslips", "Starter"],
    ["recurring", "Business"],
    ["leave_management", "Business"],
    ["apiAccess", "Growth"],
    ["multi_company", "Growth"],
    ["customBranding", "Enterprise"],
  ])("%s → %s", (feature, plan) => {
    expect(getRequiredPlan(feature)).toBe(plan);
  });
});

/**
 * Verification matrix (spec §11). For each case: effective package, entitlement state, feature
 * visibility (client), backend authorization (server gate), upgrade CTA, displayed package.
 * Growth is the top of the self-serve path, so it never gets a CTA.
 */
describe("verification matrix", () => {
  const serverAllows = async (feature) =>
    assertUserHasFeature(memory, OWNER, feature).then(() => true, () => false);

  /** Everything the spec asks to verify, from one resolver pass. */
  async function check(feature) {
    const e = await entitlementFor();
    const ui = deriveEntitlementFromSubscriptionCurrent({ entitlement: e });
    return {
      plan: e.plan,
      access: e.accessGranted,
      visible: clientHasFeature(feature, { snapshot: ui }),
      server: await serverAllows(feature),
      cta: getUpgradeTarget(feature, ui).label,
      badge: describeEntitlementBadge(ui).planLabel,
      seats: e.limits.seats,
    };
  }

  const adminActivate = (row, body) => {
    const { patch } = buildAdminOverridePatch(row, body, { actorId: randomUUID() });
    Object.assign(row, patch);
  };

  // 1–3 trial + package, 4–6 active package: full package, package limits, no CTA on own features.
  it.each([
    ["trialing", "starter", "invoices", 1],
    ["trialing", "business", "leave_management", 5],
    ["trialing", "growth", "api_access", null],
    ["active", "starter", "invoices", 1],
    ["active", "business", "leave_management", 5],
    ["active", "growth", "api_access", null],
  ])("%s %s: full package, own limits, no CTA", async (status, plan, feature, seats) => {
    seed({ plan, status, trialEndsInMs: status === "trialing" ? 5 * DAY : null });
    expect(await check(feature)).toEqual({
      plan, access: true, visible: true, server: true, cta: "", badge: plan[0].toUpperCase() + plan.slice(1), seats,
    });
  });

  it("7. expired Business trial: package kept, access off, CTA renews Business (never Starter)", async () => {
    seed({ plan: "business", status: "trialing", trialEndsInMs: -DAY });
    expect(await check("reports_basic")).toMatchObject({
      plan: "business", access: false, visible: false, server: false, cta: "Renew Business", badge: "Business",
    });
  });

  it("8. admin activated Starter for 15 days", async () => {
    const row = seed({ plan: "starter", status: "expired" });
    adminActivate(row, { action: "start_trial", plan: "starter", days: 15 });
    const e = await entitlementFor();
    expect(e).toMatchObject({ plan: "starter", accessGranted: true, trialing: true, trialDaysRemaining: 15 });
    expect(await check("inventory")).toMatchObject({ visible: false, server: false, cta: "Upgrade to Business" });
  });

  it("9. admin activated Business for 30 days: Business, not Starter", async () => {
    const row = seed({ plan: "starter", status: "trialing", trialEndsInMs: -DAY });
    adminActivate(row, { action: "start_trial", plan: "business", days: 30 });
    const e = await entitlementFor();
    expect(e).toMatchObject({ plan: "business", accessGranted: true, trialDaysRemaining: 30 });
    expect(await check("leave_management")).toMatchObject({ plan: "business", visible: true, server: true, cta: "" });
  });

  it("10. admin activated Growth indefinitely", async () => {
    const row = seed({ plan: "starter", status: "expired" });
    adminActivate(row, { action: "activate_indefinite", plan: "growth" });
    expect(await entitlementFor()).toMatchObject({ plan: "growth", accessGranted: true, trialing: false, trialEndsAt: null });
    expect(await check("api_access")).toMatchObject({ visible: true, server: true, cta: "" });
  });

  // 11–14: package changes take effect on the next resolve; no stale features either way.
  it.each([
    ["starter", "business", "leave_management", true],
    ["business", "growth", "api_access", true],
    ["growth", "business", "api_access", false],
    ["business", "starter", "leave_management", false],
  ])("%s → %s: %s allowed=%s", async (from, to, feature, allowed) => {
    seed({ plan: from, status: "active" });
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, { id: randomUUID() }, { user_id: OWNER, plan: to });
    const r = await check(feature);
    expect(r).toMatchObject({ plan: to, visible: allowed, server: allowed });
    expect(r.cta).not.toMatch(/Starter/);
    if (!allowed) expect(r.cta).toBe(to === "business" ? "Upgrade to Growth" : "Upgrade to Business");
  });

  it("15. Growth on a Starter-level area: allowed, no CTA (tiers are additive)", async () => {
    seed({ plan: "growth" });
    expect(await check("reports_basic")).toMatchObject({ visible: true, server: true, cta: "" });
  });

  it("16/17. Business on Business features, Growth on Growth features", async () => {
    seed({ plan: "business" });
    expect(await check("inventory")).toMatchObject({ visible: true, server: true, cta: "" });
    tables.subscriptions[0].plan_slug = "growth_monthly";
    tables.subscriptions[0].plan_family = "growth";
    expect(await check("api_access")).toMatchObject({ visible: true, server: true, cta: "" });
  });

  it("18. unavailable to Starter → Upgrade to Business (next package with it)", async () => {
    seed({ plan: "starter" });
    expect(await check("pos")).toMatchObject({ visible: false, server: false, cta: "Upgrade to Business" });
    expect(await check("api_access")).toMatchObject({ cta: "Upgrade to Growth" });
  });

  it("19. unavailable to Business → Upgrade to Growth", async () => {
    seed({ plan: "business" });
    expect(await check("multi_company")).toMatchObject({ visible: false, server: false, cta: "Upgrade to Growth" });
  });

  it("20. unavailable to Growth (Enterprise-only): denied server-side, but no upgrade CTA", async () => {
    seed({ plan: "growth" });
    expect(await check("sso")).toMatchObject({ visible: false, server: false, cta: "" });
  });
});

describe("root-cause regressions", () => {
  it("PayFast ITN on a Starter trial row for a Business payment → Business (plan_family written)", async () => {
    const row = seed({ plan: "starter", status: "trialing", trialEndsInMs: 3 * DAY });
    await upsertSubscriptionFromItn(
      memory,
      { payment_status: "COMPLETE", token: "tok-1", custom_str2: "business_monthly", amount_gross: "150" },
      { userIdHint: OWNER }
    );
    expect(tables.subscriptions).toHaveLength(1);
    expect(row).toMatchObject({ plan_slug: "business_monthly", plan_family: "business", status: "active" });
    expect(await entitlementFor()).toMatchObject({ plan: "business", accessGranted: true });
  });

  it("already-drifted row (slug business, family starter) resolves to the slug's package", async () => {
    seed({ plan: "starter", extra: { plan_slug: "business_monthly", plan: "business_monthly" } });
    expect((await entitlementFor()).plan).toBe("business");
  });

  it("owner row without company_id still decides the company's package (owner and members)", async () => {
    seed({ plan: "growth", extra: { company_id: null } });
    const MEMBER = randomUUID();
    tables.memberships.push({ org_id: COMPANY, user_id: MEMBER, created_at: iso(0) });
    expect(await entitlementFor()).toMatchObject({ plan: "growth", accessGranted: true });
    expect((await entitlementFor(MEMBER)).plan).toBe("growth");
  });

  it("admin package change adopts an orphan row into the company", async () => {
    seed({ plan: "starter", extra: { company_id: null } });
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, { id: randomUUID() }, { user_id: OWNER, plan: "business" });
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0]).toMatchObject({ company_id: COMPANY, plan_family: "business" });
  });

  it.each(["trial", "free", "none"])("plan '%s' with no package is no package — never Starter", async (plan) => {
    seed({ plan: "starter", status: "active", extra: { plan, plan_slug: null, plan_family: null, current_plan: plan } });
    const e = await entitlementFor();
    expect(e.plan).toBeNull();
    expect(e.features).toEqual([]);
  });
});

/** The Paidly package access matrix, row for row (✓ = included, — = not included). */
describe("package access matrix", () => {
  const MATRIX = [
    // [row, feature key, starter, business, growth]
    ["Invoices", "invoices", 1, 1, 1],
    ["Quotes", "quotes", 1, 1, 1],
    ["Clients", "clients", 1, 1, 1],
    ["Templates", "templates", 0, 1, 1],
    ["Inventory", "inventory", 0, 1, 1],
    ["Recurring Invoices", "recurring_invoices", 0, 1, 1],
    ["POS", "pos", 0, 1, 1],
    ["Expenses", "expenses", 0, 1, 1],
    ["Purchase Orders", "purchase_orders", 0, 1, 1],
    ["Reports Basic", "reports_basic", 1, 1, 1],
    ["Basic Reports", "basic_reports", 1, 1, 1],
    ["VAT Reports", "vat_reports", 0, 1, 1],
    ["Documents / PDF", "documents_pdf", 1, 1, 1],
    ["Email Send", "email_send", 1, 1, 1],
    ["Email", "email", 1, 1, 1],
    ["Email Templates", "email_templates", 0, 1, 1],
    ["Payslips (count-limited: 1 / 4 / unlimited employees)", "payslips", 1, 1, 1],
    ["Payroll (pay runs)", "payroll", 0, 1, 1],
    ["Leave", "leave_management", 0, 1, 1],
    ["Support Basic", "support_basic", 1, 1, 1],
    ["Support Priority", "support_priority", 0, 1, 1],
  ];

  it.each(MATRIX)("%s", (_row, key, starter, business, growth) => {
    expect(familyHasFeature("starter", key)).toBe(Boolean(starter));
    expect(familyHasFeature("business", key)).toBe(Boolean(business));
    expect(familyHasFeature("growth", key)).toBe(Boolean(growth));
  });

  it("payslip employees: Starter 1, Business 4, Growth unlimited", () => {
    expect(FAMILY_LIMITS.starter.payslipEmployees).toBe(1);
    expect(FAMILY_LIMITS.business.payslipEmployees).toBe(4);
    expect(FAMILY_LIMITS.growth.payslipEmployees).toBeNull();
  });

  it("Growth has every non-Enterprise feature", () => {
    const keys = [...new Set(MATRIX.map((r) => r[1]).concat(["departments", "api_access", "integrations", "multi_company"]))];
    for (const key of keys) expect(familyHasFeature("growth", key)).toBe(true);
  });

  it("limit upgrade target starts from the current package", () => {
    expect(lowestFamilyAllowing("starter", "payslipEmployees", 2)).toBe("business");
    expect(lowestFamilyAllowing("starter", "payslipEmployees", 5)).toBe("growth");
    expect(lowestFamilyAllowing("business", "payslipEmployees", 5)).toBe("growth");
    expect(lowestFamilyAllowing("growth", "payslipEmployees", 500)).toBe("growth");
  });
});

describe("payroll employee limit (server-enforced, from the company package)", () => {
  // n new employees (no payslips yet) joining a pay run.
  const employees = (n) => Array.from({ length: n }, (_, i) => ({ membership_id: `m${i + 1}`, full_name: `Employee ${i + 1}` }));
  const allowed = (n) => assertPayrollEmployeeCapacity(COMPANY, employees(n), { supabase: memory }).then(() => true, (e) => e);

  it.each([
    ["starter", 1, true],
    ["starter", 2, "Upgrade to Business"],
    ["business", 4, true],
    ["business", 5, "Upgrade to Growth"],
    ["growth", 250, true],
  ])("%s with %i on payroll", async (plan, count, expected) => {
    seed({ plan });
    const r = await allowed(count);
    if (expected === true) {
      expect(r).toBe(true);
    } else {
      expect(r).toMatchObject({ status: 403, code: "PAYROLL_EMPLOYEE_LIMIT" });
      expect(r.message).toContain(expected);
    }
  });

  it("a Business trial gets the Business limit (4), not Starter's", async () => {
    seed({ plan: "business", status: "trialing", trialEndsInMs: 3 * DAY });
    expect(await allowed(4)).toBe(true);
    expect((await entitlementFor()).limits.payslipEmployees).toBe(4);
  });

  it("admin Starter → Growth lifts the limit immediately", async () => {
    seed({ plan: "starter" });
    expect(await allowed(3)).not.toBe(true);
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, { id: randomUUID() }, { user_id: OWNER, plan: "growth" });
    expect(await allowed(3)).toBe(true);
  });
});

/** Spec §29–30: same plan across trial / paid / admin activation / expired. */
describe("cross-status: status decides access, plan decides features", () => {
  const STATUSES = {
    trial: { status: "trialing", trialEndsInMs: 5 * DAY },
    paid: { status: "active" },
    admin: { status: "active", extra: { subscription_source: "admin", admin_override: true } },
    expired: { status: "trialing", trialEndsInMs: -DAY },
  };
  const EXPECT = {
    starter: { allowed: ["invoices", "quotes", "clients", "documents_pdf", "email", "basic_reports", "payslips"], blocked: ["inventory", "recurring_invoices", "pos", "expenses", "purchase_orders", "payroll", "leave_management", "vat_reports", "email_templates", "templates"], payslips: 1 },
    business: { allowed: ["invoices", "quotes", "clients", "templates", "inventory", "recurring_invoices", "pos", "expenses", "purchase_orders", "payroll", "leave_management", "vat_reports", "email_templates"], blocked: ["api_access", "multi_company"], payslips: 4 },
    growth: { allowed: [...FAMILY_FEATURES.growth], blocked: [], payslips: null },
  };

  for (const plan of ["starter", "business", "growth"]) {
    for (const [label, st] of Object.entries(STATUSES)) {
      it(`${plan} ${label}`, async () => {
        seed({ plan, status: st.status, trialEndsInMs: st.trialEndsInMs ?? null, extra: st.extra || {} });
        const e = await entitlementFor();
        expect(e.plan).toBe(plan); // expiry never changes the plan
        const ui = deriveEntitlementFromSubscriptionCurrent({ entitlement: e });
        const server = (f) => assertUserHasFeature(memory, OWNER, f).then(() => true, () => false);
        if (label === "expired") {
          expect(e.accessGranted).toBe(false);
          for (const f of EXPECT[plan].allowed) {
            expect(clientHasFeature(f, { snapshot: ui })).toBe(false);
            expect(await server(f)).toBe(false);
          }
          return;
        }
        expect(e.accessGranted).toBe(true);
        for (const f of EXPECT[plan].allowed) {
          expect(clientHasFeature(f, { snapshot: ui }), f).toBe(true);
          expect(await server(f), f).toBe(true);
        }
        for (const f of EXPECT[plan].blocked) {
          expect(clientHasFeature(f, { snapshot: ui }), f).toBe(false);
          expect(await server(f), f).toBe(false);
        }
        expect(e.limits.payslipEmployees).toBe(EXPECT[plan].payslips);
      });
    }
  }
});

/** Spec §31: direct API calls. POS / payroll / leave are server routes; see DB guard parity below. */
describe("security: Starter calling Business APIs directly is refused server-side", () => {
  it.each(["pos", "payroll", "leave_management", "vat_reports", "purchase_orders", "inventory", "expenses", "recurring_invoices"])(
    "starter → %s",
    async (feature) => {
      seed({ plan: "starter" });
      await expect(assertUserHasFeature(memory, OWNER, feature)).rejects.toBeInstanceOf(UpgradeRequiredError);
    }
  );

  it("company A's plan never applies to company B (resolved per company)", async () => {
    seed({ plan: "growth" });
    const B = "33333333-3333-4333-8333-333333333333";
    const B_OWNER = "44444444-4444-4444-8444-444444444444";
    tables.organizations.push({ id: B, owner_id: B_OWNER, created_at: iso(-DAY) });
    tables.subscriptions.push({ id: randomUUID(), company_id: B, user_id: B_OWNER, status: "active", plan_slug: "starter_monthly", plan_family: "starter", updated_at: iso(0) });
    expect((await entitlementFor(OWNER)).plan).toBe("growth");
    expect((await entitlementFor(B_OWNER)).plan).toBe("starter");
    await expect(assertUserHasFeature(memory, B_OWNER, "pos")).rejects.toBeInstanceOf(UpgradeRequiredError);
  });
});

/** The DB guard for browser-written tables must mirror the one catalog exactly. */
describe("database plan guard mirrors shared/planFeatures.js", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260924120000_plan_feature_db_guard.sql", import.meta.url), "utf8");
  const tierFn = sql.slice(sql.indexOf("FUNCTION public.paidly_feature_min_tier"), sql.indexOf("FUNCTION public.paidly_payslip_employee_limit"));
  const sqlTiers = Object.fromEntries([...tierFn.matchAll(/WHEN '([a-z_]+)' THEN (\d+)/g)].map((m) => [m[1], Number(m[2])]));

  it("every catalog feature has the same tier in SQL", () => {
    const all = new Set(Object.values(FAMILY_FEATURES).flat());
    for (const f of all) expect(sqlTiers[f], f).toBe(requiredTierForFeature(f));
    expect(Object.keys(sqlTiers).sort()).toEqual([...all].sort());
  });

  it("payslip employee limits match", () => {
    const limitFn = sql.slice(sql.indexOf("FUNCTION public.paidly_payslip_employee_limit"), sql.indexOf("FUNCTION public.paidly_family_label"));
    for (const fam of ["starter", "business", "growth", "enterprise"]) {
      const m = new RegExp(`WHEN '${fam}' THEN (\\d+|NULL)`).exec(limitFn);
      const v = m[1] === "NULL" ? null : Number(m[1]);
      expect(v, fam).toBe(FAMILY_LIMITS[fam].payslipEmployees);
    }
  });

  it("guarded tables use the same features as the browser write gate", () => {
    const pairs = Object.fromEntries([...sql.matchAll(/ARRAY\['([a-z_]+)', '([a-z_]+)'\]/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(pairs)).toHaveLength(9);
    const em = readFileSync(new URL("../../src/api/entity/EntityManager.js", import.meta.url), "utf8");
    for (const [table, feature] of Object.entries(pairs)) {
      if (feature === "catalog") {
        // services: feature by item_type (catalogItemFeature), same in the browser gate.
        expect(em).toMatch(/services: catalogItemFeature\(rowData\?\.item_type\)/);
        continue;
      }
      expect(em, table).toMatch(new RegExp(`${table}: "${feature}"`));
      expect(requiredTierForFeature(feature)).toBeLessThan(99);
    }
  });

  it("plan guard errors surface as customer messages with their code", () => {
    const err = planGuardErrorFromSupabase({
      message: "Your Starter plan includes payslips for 1 employee. Upgrade to Business to issue payslips for more employees.",
      hint: "PAYSLIP_EMPLOYEE_LIMIT:payslips",
    });
    expect(err).toMatchObject({ code: "PAYSLIP_EMPLOYEE_LIMIT", feature: "payslips" });
    expect(err.message).toMatch(/^Your Starter plan/);
    expect(planGuardErrorFromSupabase({ message: "duplicate key", hint: "" })).toBeNull();
  });
});

describe("entitlement helpers", () => {
  it("getPlanEntitlements / getFeatureLimit", () => {
    expect(getPlanEntitlements("business")).toContain("payroll");
    expect(getPlanEntitlements("starter")).not.toContain("payroll");
    expect(getPlanEntitlements(null)).toEqual([]);
    expect(getFeatureLimit("starter", "payslipEmployees")).toBe(1);
    expect(getFeatureLimit("growth", "payslipEmployees")).toBeNull();
    expect(getFeatureLimit(null, "payslipEmployees")).toBe(0);
  });

  it("payslip employee identity: membership, else employee number, else name", () => {
    expect(payslipEmployeeKey({ membership_id: "m1", employee_id: "E1" })).toBe("m1");
    expect(payslipEmployeeKey({ employee_id: " E1 ", employee_name: "Ann" })).toBe("e1");
    expect(payslipEmployeeKey({ employee_name: " Ann Lee " })).toBe("ann lee");
    expect(payslipEmployeeKey({})).toBeNull();
  });
});
