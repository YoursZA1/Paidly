/**
 * The package an administrator grants decides the features, for exactly the duration they chose.
 *
 * - a finite trial expires on its end date, admin-granted or not
 * - indefinite administrative access (status active, no trial end) does not expire
 * - profiles.plan never overrides a valid subscription
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables } = vi.hoisted(() => {
  const tables = { subscriptions: [], profiles: [], memberships: [], organizations: [] };
  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "notnull") return v != null;
    return true;
  };
  const memory = {
    from(table) {
      const st = { action: "select", payload: null, filters: [], order: null, limit: null };
      const rowsNow = () => (tables[table] || []).filter((r) => st.filters.every((f) => matches(r, f)));
      const run = () => {
        if (st.action === "update") {
          const found = rowsNow();
          found.forEach((r) => Object.assign(r, st.payload));
          return { data: found, error: null };
        }
        let rows = rowsNow();
        if (st.order) {
          const { col, asc } = st.order;
          rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return { data: rows, error: null };
      };
      const api = {
        select() { return api; },
        update(p) { st.action = "update"; st.payload = p; return api; },
        eq(col, value) { st.filters.push({ op: "eq", col, value }); return api; },
        not(col) { st.filters.push({ op: "notnull", col }); return api; },
        order(col, opts) { st.order = { col, asc: opts?.ascending !== false }; return api; },
        limit(n) { st.limit = n; return api; },
        async maybeSingle() { return { data: (run().data || [])[0] || null, error: null }; },
        then(resolve) { return resolve(run()); },
      };
      return api;
    },
  };
  return { memory, tables };
});

vi.mock("../../server/src/billing/supabaseAdmin.js", () => ({ getBillingSupabaseAdmin: () => memory }));

import { buildEntitlementSnapshot, resolveEntitlement } from "../../server/src/billing/entitlements.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../../server/src/featureGate.js";
import { buildAdminOverridePatch } from "../../server/src/billing/adminSubscriptionOverride.js";
import { hasSubscriptionAccess, shouldExpireTrialRow } from "../../shared/subscriptionAccess.js";
import { deriveEntitlementFromSubscriptionCurrent, clientHasFeature, describeEntitlementBadge, isEntitlementLapsed } from "../../src/lib/clientEntitlement.js";
import { FAMILY_FEATURES } from "../../shared/planFeatures.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;
const iso = (off) => new Date(Date.now() + off).toISOString();

function seed(partial) {
  tables.organizations.push({ id: COMPANY, owner_id: USER, created_at: iso(-60 * DAY) });
  tables.subscriptions.push({
    id: randomUUID(),
    company_id: COMPANY,
    user_id: USER,
    admin_override: false,
    subscription_source: "payfast",
    updated_at: iso(-DAY),
    created_at: iso(-30 * DAY),
    ...partial,
  });
}

const ent = async () => buildEntitlementSnapshot(await resolveEntitlement(memory, USER));
const ui = async () => deriveEntitlementFromSubscriptionCurrent({ entitlement: await ent() });

/** Every package's features, as the product describes them. */
const GROWTH_FEATURES = [
  "invoices", "quotes", "clients", "reports_basic", "email", "documents_pdf",
  "inventory", "pos", "expenses", "purchase_orders", "payslips", "vat_reports",
  "recurring_invoices", "email_templates", "support_priority",
  "departments", "approval_workflows", "leave_management", "reports_advanced",
  "advanced_reports", "api_access", "integrations", "multi_company",
];

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k] = [];
});

describe("admin grants: package + duration decide access", () => {
  it("Growth + 30 days + Start trial → Growth entitlements for 30 days", async () => {
    seed({ status: "expired", plan_family: "starter", plan_slug: "starter_monthly" });
    const existing = tables.subscriptions[0];
    const { patch } = buildAdminOverridePatch(
      existing,
      { action: "start_trial", plan: "growth", days: 30 },
      { actorId: "admin-1" }
    );
    Object.assign(existing, patch);

    expect(patch).toMatchObject({
      status: "trialing",
      plan_family: "growth",
      plan_slug: "growth_monthly",
      subscription_source: "admin",
      admin_override: true,
    });
    const daysOut = Math.round((new Date(patch.trial_ends_at) - Date.now()) / DAY);
    expect(daysOut).toBe(30);

    const snapshot = await ent();
    expect(snapshot).toMatchObject({ plan: "growth", accessGranted: true, trialing: true });
    expect(snapshot.trialDaysRemaining).toBe(30);

    // Every Growth feature is available during the admin trial.
    for (const feature of GROWTH_FEATURES) {
      await expect(assertUserHasFeature(memory, USER, feature)).resolves.toBeUndefined();
    }
    const client = await ui();
    for (const feature of GROWTH_FEATURES) {
      expect(clientHasFeature(feature, { snapshot: client })).toBe(true);
    }
  });

  it.each([
    ["starter", 7],
    ["business", 15],
    ["growth", 30],
  ])("%s trial for %i days grants exactly that package", async (plan, days) => {
    seed({ status: "expired", plan_family: "starter" });
    const existing = tables.subscriptions[0];
    const { patch } = buildAdminOverridePatch(existing, { action: "start_trial", plan, days }, {});
    Object.assign(existing, patch);

    const snapshot = await ent();
    expect(snapshot).toMatchObject({ plan, accessGranted: true, trialing: true });
    expect(snapshot.features.sort()).toEqual([...FAMILY_FEATURES[plan]].sort());
    expect(Math.round((new Date(patch.trial_ends_at) - Date.now()) / DAY)).toBe(days);
  });

  it("Indefinite activation: active, no trial end, still granted after simulated time passage", async () => {
    seed({ status: "expired", plan_family: "starter", trial_ends_at: iso(-10 * DAY) });
    const existing = tables.subscriptions[0];
    const { patch } = buildAdminOverridePatch(
      existing,
      { action: "activate_indefinite", plan: "growth" },
      { actorId: "admin-1" }
    );
    Object.assign(existing, patch);

    expect(patch).toMatchObject({ status: "active", plan_family: "growth", admin_override: true });
    expect(patch.trial_ends_at).toBeNull();
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: true, trialing: false });

    const inAYear = new Date(Date.now() + 365 * DAY);
    expect(hasSubscriptionAccess(existing, inAYear)).toBe(true);
    expect(shouldExpireTrialRow(existing, inAYear)).toBe(false);
  });

  it("an expired admin trial is not resurrected by admin_override", async () => {
    seed({
      status: "trialing",
      plan_family: "growth",
      plan_slug: "growth_monthly",
      subscription_source: "admin",
      admin_override: true,
      trial_ends_at: iso(-DAY),
    });
    const snapshot = await ent();
    expect(snapshot).toMatchObject({ plan: "growth", accessGranted: false, features: [] });
    await expect(assertUserHasFeature(memory, USER, "invoices")).rejects.toBeInstanceOf(UpgradeRequiredError);
    // automation may now flip it, and the resolver already wrote the expiry
    expect(tables.subscriptions[0].status).toBe("expired");
  });

  it("admin suspend removes access, resume restores the same package", async () => {
    seed({ status: "active", plan_family: "growth", plan_slug: "growth_monthly" });
    const existing = tables.subscriptions[0];
    Object.assign(existing, buildAdminOverridePatch(existing, { action: "suspend" }, {}).patch);
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: false });

    Object.assign(existing, buildAdminOverridePatch(existing, { action: "activate" }, {}).patch);
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: true });
  });

  it("PayFast rows keep their source and package; admin trial logic does not touch them", async () => {
    seed({ status: "active", plan_family: "business", plan_slug: "business_monthly", subscription_source: "payfast" });
    const snapshot = await ent();
    expect(snapshot).toMatchObject({ plan: "business", accessGranted: true });
    expect(tables.subscriptions[0].subscription_source).toBe("payfast");
    expect(tables.subscriptions[0].admin_override).toBe(false);
    await expect(assertUserHasFeature(memory, USER, "payslips")).resolves.toBeUndefined();
    await expect(assertUserHasFeature(memory, USER, "api_access")).rejects.toBeInstanceOf(UpgradeRequiredError);
  });
});

describe("multiple subscription rows: the current agreement wins", () => {
  it("old Starter expired + new Growth admin trial → Growth", async () => {
    seed({ status: "expired", plan_family: "starter", updated_at: iso(-20 * DAY) });
    seed({
      status: "trialing",
      plan_family: "growth",
      subscription_source: "admin",
      admin_override: true,
      trial_ends_at: iso(29 * DAY),
      updated_at: iso(-1000),
    });
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: true });
  });

  it("old Starter active + newer Growth admin trial → Growth (stale row does not win)", async () => {
    seed({ status: "active", plan_family: "starter", updated_at: iso(-45 * DAY) });
    seed({
      status: "trialing",
      plan_family: "growth",
      subscription_source: "admin",
      admin_override: true,
      trial_ends_at: iso(29 * DAY),
      updated_at: iso(-1000),
    });
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: true });
  });

  it("Starter active + Growth pending checkout → Starter keeps access", async () => {
    seed({ status: "active", plan_family: "starter", updated_at: iso(-10 * DAY) });
    seed({ status: "pending", plan_family: "growth", updated_at: iso(-100) });
    expect(await ent()).toMatchObject({ plan: "starter", accessGranted: true });
  });

  it("Business cancelled + Growth admin active → Growth", async () => {
    seed({ status: "cancelled", plan_family: "business", updated_at: iso(-30 * DAY) });
    seed({
      status: "active",
      plan_family: "growth",
      subscription_source: "admin",
      admin_override: true,
      updated_at: iso(-100),
    });
    expect(await ent()).toMatchObject({ plan: "growth", accessGranted: true });
  });
});

describe("regression: profile cache never downgrades a valid subscription", () => {
  it("profile.plan = starter + Growth admin trial → Growth, no 'Upgrade to Starter'", async () => {
    tables.profiles.push({ id: USER, plan: "starter", subscription_plan: "starter" });
    seed({
      status: "trialing",
      plan_family: "growth",
      plan_slug: "growth_monthly",
      subscription_source: "admin",
      admin_override: true,
      trial_ends_at: iso(20 * DAY),
    });

    const client = await ui();
    expect(client).toMatchObject({ planFamily: "growth", accessGranted: true });
    expect(describeEntitlementBadge(client)).toMatchObject({ plan: "growth", planLabel: "Growth" });
    expect(clientHasFeature("reports_advanced", { snapshot: client })).toBe(true);
    // nothing anywhere resolves to Starter
    expect(client.planSlug).not.toBe("starter");
    expect(isEntitlementLapsed(client)).toBe(false);
  });

  it("profile.plan = growth + expired Growth trial → no access, billing-lock copy, package still named", async () => {
    tables.profiles.push({ id: USER, plan: "growth", is_pro: true });
    seed({
      status: "trialing",
      plan_family: "growth",
      subscription_source: "admin",
      admin_override: true,
      trial_ends_at: iso(-DAY),
    });

    const client = await ui();
    expect(client.accessGranted).toBe(false);
    expect(describeEntitlementBadge(client)).toMatchObject({ plan: "growth", statusLabel: "Trial expired" });
    expect(isEntitlementLapsed(client)).toBe(true);
    for (const feature of ["invoices", "expenses", "pos", "api_access"]) {
      expect(clientHasFeature(feature, { snapshot: client })).toBe(false);
    }
    await expect(assertUserHasFeature(memory, USER, "invoices")).rejects.toBeInstanceOf(UpgradeRequiredError);
  });
});
