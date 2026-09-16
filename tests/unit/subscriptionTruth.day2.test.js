/**
 * Day 2 — subscription is SoR; profiles.plan cannot grant paid access.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables } = vi.hoisted(() => {
  const tables = {
    subscriptions: [],
    profiles: [],
    memberships: [],
  };

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return String(row[filter.col] ?? "") === String(filter.value ?? "");
        return true;
      })
    );
  }

  const memory = {
    from(table) {
      const state = {
        action: "select",
        payload: null,
        filters: [],
        order: null,
        limit: null,
        selectingAfterUpdate: false,
      };
      const api = {
        select() {
          if (state.action === "update") {
            state.selectingAfterUpdate = true;
          } else {
            state.action = "select";
          }
          return api;
        },
        update(payload) {
          state.action = "update";
          state.payload = payload;
          return api;
        },
        eq(col, value) {
          state.filters.push({ op: "eq", col, value });
          return api;
        },
        order(col, opts) {
          state.order = { col, ascending: opts?.ascending !== false };
          return api;
        },
        limit(n) {
          state.limit = n;
          return api;
        },
        async maybeSingle() {
          let rows = applyFilters(tables[table] || [], state.filters);
          if (state.action === "update") {
            rows.forEach((row) => Object.assign(row, state.payload));
            return { data: rows[0] || null, error: null };
          }
          return { data: rows[0] || null, error: null };
        },
        then(resolve) {
          let rows = applyFilters(tables[table] || [], state.filters);
          if (state.order) {
            rows = [...rows].sort((a, b) => {
              const av = a[state.order.col];
              const bv = b[state.order.col];
              if (av === bv) return 0;
              const cmp = av > bv ? 1 : -1;
              return state.order.ascending ? cmp : -cmp;
            });
          }
          if (state.limit != null) rows = rows.slice(0, state.limit);
          if (state.action === "update") {
            const found = applyFilters(tables[table] || [], state.filters);
            found.forEach((row) => Object.assign(row, state.payload));
            return resolve({ data: state.selectingAfterUpdate ? found[0] || null : found, error: null });
          }
          return resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };

  return { memory, tables };
});

vi.mock("../../server/src/billing/supabaseAdmin.js", () => ({
  getBillingSupabaseAdmin: () => memory,
}));

import {
  assertUserHasFeature,
  UpgradeRequiredError,
  fetchProfilePlanSlug,
} from "../../server/src/featureGate.js";
import {
  entitlementsEnforceEnabled,
  resolveEntitlement,
} from "../../server/src/billing/entitlements.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function seedProfile(plan) {
  tables.profiles = [{ id: USER, plan, subscription_plan: plan }];
}

function seedSubscription(partial) {
  tables.subscriptions = [
    {
      id: randomUUID(),
      company_id: COMPANY,
      user_id: USER,
      status: "active",
      plan_slug: "starter_monthly",
      plan_family: "starter",
      admin_override: false,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ...partial,
    },
  ];
}

describe("subscription truth — profiles.plan cannot override", () => {
  beforeEach(() => {
    tables.subscriptions = [];
    tables.profiles = [];
    tables.memberships = [{ user_id: USER, org_id: COMPANY, role: "owner" }];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("CASE Free sub + Paid profile → deny payslips", async () => {
    seedSubscription({ status: "expired", plan_slug: "free", plan_family: null });
    seedProfile("business_monthly");
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).rejects.toBeInstanceOf(
      UpgradeRequiredError
    );
    // Profile still looks paid (display only)
    expect(await fetchProfilePlanSlug(memory, USER)).toBe("business_monthly");
  });

  it("CASE Paid sub + Free profile → allow payslips", async () => {
    seedSubscription({
      status: "active",
      plan_slug: "business_monthly",
      plan_family: "business",
    });
    seedProfile("free");
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).resolves.toBeUndefined();
  });

  it("CASE Expired sub + Paid profile → deny leave_management", async () => {
    seedSubscription({
      status: "expired",
      plan_slug: "growth_monthly",
      plan_family: "growth",
    });
    seedProfile("growth_monthly");
    await expect(
      assertUserHasFeature(memory, USER, "leave_management", { companyId: COMPANY })
    ).rejects.toBeInstanceOf(UpgradeRequiredError);
  });

  it("CASE Trialing valid + Free profile → allow starter invoices; deny growth leave", async () => {
    const ends = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    seedSubscription({
      status: "trialing",
      plan_slug: "business_monthly",
      plan_family: "business",
      trial_ends_at: ends,
    });
    seedProfile("free");
    await expect(assertUserHasFeature(memory, USER, "invoices", { companyId: COMPANY })).resolves.toBeUndefined();
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).resolves.toBeUndefined();
    await expect(
      assertUserHasFeature(memory, USER, "leave_management", { companyId: COMPANY })
    ).rejects.toBeInstanceOf(UpgradeRequiredError);
  });

  it("CASE Trialing past trial_ends_at → deny even if profile paid", async () => {
    const ended = new Date(Date.now() - 60_000).toISOString();
    seedSubscription({
      status: "trialing",
      plan_slug: "business_monthly",
      plan_family: "business",
      trial_ends_at: ended,
      admin_override: false,
    });
    seedProfile("business_monthly");
    const ent = await resolveEntitlement(memory, USER, COMPANY);
    expect(ent.access).toBe(false);
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).rejects.toBeInstanceOf(
      UpgradeRequiredError
    );
  });

  it("CASE Paid sub + Expired-looking profile → subscription wins", async () => {
    seedSubscription({
      status: "active",
      plan_slug: "growth_monthly",
      plan_family: "growth",
    });
    seedProfile("expired");
    await expect(
      assertUserHasFeature(memory, USER, "leave_management", { companyId: COMPANY })
    ).resolves.toBeUndefined();
  });

  it("past_due within grace → access; past_due after grace → deny", async () => {
    seedSubscription({
      status: "past_due",
      plan_slug: "business_monthly",
      plan_family: "business",
      grace_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    seedProfile("free");
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).resolves.toBeUndefined();

    seedSubscription({
      status: "past_due",
      plan_slug: "business_monthly",
      plan_family: "business",
      grace_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).rejects.toBeInstanceOf(
      UpgradeRequiredError
    );
  });

  it("cancelled before period end → access; after → deny", async () => {
    seedSubscription({
      status: "cancelled",
      plan_slug: "business_monthly",
      plan_family: "business",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).resolves.toBeUndefined();

    seedSubscription({
      status: "cancelled",
      plan_slug: "business_monthly",
      plan_family: "business",
      current_period_end: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await expect(assertUserHasFeature(memory, USER, "payslips", { companyId: COMPANY })).rejects.toBeInstanceOf(
      UpgradeRequiredError
    );
  });
});

describe("PAIDLY_ENTITLEMENTS_ENFORCE defaults", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explicit true/false win", () => {
    vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "true");
    expect(entitlementsEnforceEnabled()).toBe(true);
    vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "false");
    expect(entitlementsEnforceEnabled()).toBe(false);
  });

  it("unset + VERCEL_ENV=preview → enforce", () => {
    vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(entitlementsEnforceEnabled()).toBe(true);
  });

  it("unset + VERCEL_ENV=production → report-only", () => {
    vi.stubEnv("PAIDLY_ENTITLEMENTS_ENFORCE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(entitlementsEnforceEnabled()).toBe(false);
  });
});
