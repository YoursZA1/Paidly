/**
 * Admin Dashboard → Users → Edit → Actions.
 * Account access lives on the company subscription (suspended | active), never on profiles —
 * `profiles` has no status column, which is what produced
 * "Could not find the 'status' column of 'profiles' in the schema cache".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const { memory, tables } = vi.hoisted(() => {
  const tables = { subscriptions: [], profiles: [], memberships: [], organizations: [], subscription_events: [], audit_logs: [] };
  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    return true;
  };
  const memory = {
    auth: { admin: { getUserById: async (id) => ({ data: { user: { id, email: "u@example.com" } }, error: null }) } },
    from(table) {
      const st = { action: "select", payload: null, filters: [], order: null, limit: null };
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
        if (st.order) {
          const { col, asc } = st.order;
          rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return { data: rows, error: null };
      };
      const api = {
        select() { return api; },
        insert(p) { st.action = "insert"; st.payload = p; return api; },
        update(p) { st.action = "update"; st.payload = p; return api; },
        eq(col, value) { st.filters.push({ op: "eq", col, value }); return api; },
        in(col, value) { st.filters.push({ op: "in", col, value }); return api; },
        order(col, opts) { st.order = { col, asc: opts?.ascending !== false }; return api; },
        limit(n) { st.limit = n; return api; },
        async maybeSingle() { return { data: (run().data || [])[0] || null, error: null }; },
        async single() { return { data: (run().data || [])[0] || null, error: null }; },
        then(resolve) { return resolve(run()); },
      };
      return api;
    },
  };
  return { memory, tables };
});

vi.mock("../../server/src/billing/supabaseAdmin.js", () => ({ getBillingSupabaseAdmin: () => memory }));
vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory, default: memory }));

import { handleAdminSetCompanyAccess, handleAdminSetCompanyPlan } from "../../server/src/billing/adminBillingApi.js";
import { accountAccessStatus } from "../../server/src/adminPlatformUsersList.js";
import { buildEntitlementSnapshot, resolveEntitlement } from "../../server/src/billing/entitlements.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;
const iso = (off) => new Date(Date.now() + off).toISOString();

function resMock() {
  const out = {};
  const res = {
    setHeader() {},
    status(c) { out.status = c; return res; },
    json(b) { out.body = b; return res; },
    end(b) { out.body = typeof b === "string" ? JSON.parse(b) : b; return res; },
  };
  return { res, out };
}

const actor = { id: randomUUID(), email: "admin@paidly.co.za" };
const setAccess = async (access) => {
  const { res, out } = resMock();
  await handleAdminSetCompanyAccess(res, memory, actor, { user_id: USER, access });
  return out;
};

function seedSubscription(partial = {}) {
  tables.organizations.push({ id: COMPANY, owner_id: USER, created_at: iso(-30 * DAY) });
  const row = {
    id: randomUUID(),
    company_id: COMPANY,
    user_id: USER,
    status: "active",
    plan: "growth",
    plan_family: "growth",
    plan_slug: "growth_monthly",
    billing_cycle: "monthly",
    amount: 350,
    trial_started_at: iso(-10 * DAY),
    trial_ends_at: iso(-3 * DAY),
    next_billing_date: iso(20 * DAY),
    payfast_token: "tok-live",
    admin_override: false,
    subscription_source: "payfast",
    updated_at: iso(-DAY),
    created_at: iso(-20 * DAY),
    ...partial,
  };
  tables.subscriptions.push(row);
  return row;
}

const entitlement = async () => buildEntitlementSnapshot(await resolveEntitlement(memory, USER));

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k] = [];
});

describe("pause / resume uses the company subscription", () => {
  it("pause suspends access and preserves package, trial, billing fields and profile", async () => {
    const row = seedSubscription();
    tables.profiles.push({ id: USER, full_name: "Jane", email: "jane@x.co" });
    const before = { ...row };

    const out = await setAccess("paused");
    expect(out.status).toBe(200);
    const after = tables.subscriptions[0];

    expect(after.status).toBe("suspended");
    expect(after.admin_override).toBe(true);
    expect((await entitlement()).accessGranted).toBe(false);
    // untouched
    expect(after.plan_family).toBe(before.plan_family);
    expect(after.plan_slug).toBe(before.plan_slug);
    expect(after.amount).toBe(before.amount);
    expect(after.trial_ends_at).toBe(before.trial_ends_at);
    expect(after.trial_started_at).toBe(before.trial_started_at);
    expect(after.payfast_token).toBe(before.payfast_token);
    expect(after.next_billing_date).toBe(before.next_billing_date);
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.profiles[0]).toEqual({ id: USER, full_name: "Jane", email: "jane@x.co" });
    expect(tables.audit_logs).toHaveLength(1);
  });

  it("resume restores access on the same package", async () => {
    seedSubscription({ status: "suspended", admin_override: true });
    expect((await entitlement()).accessGranted).toBe(false);

    await setAccess("active");
    const after = tables.subscriptions[0];
    expect(after.status).toBe("active");
    const ent = await entitlement();
    expect(ent).toMatchObject({ plan: "growth", accessGranted: true });
    expect(tables.subscriptions).toHaveLength(1);
  });

  it("pausing an account with no subscription reports it instead of writing", async () => {
    tables.organizations.push({ id: COMPANY, owner_id: USER, created_at: iso(-DAY) });
    const out = await setAccess("paused");
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ code: "NO_SUBSCRIPTION" });
    expect(tables.subscriptions).toHaveLength(0);
  });

  it("pausing an already paused account writes nothing", async () => {
    seedSubscription({ status: "suspended", admin_override: true });
    const updatedAt = tables.subscriptions[0].updated_at;
    const out = await setAccess("paused");
    expect(out.body.unchanged).toBe(true);
    expect(tables.subscriptions[0].updated_at).toBe(updatedAt);
    expect(tables.audit_logs).toHaveLength(0);
  });

  it("rejects an unknown access value", async () => {
    seedSubscription();
    const out = await setAccess("deleted");
    expect(out.status).toBe(400);
    expect(tables.subscriptions[0].status).toBe("active");
  });
});

describe("package change from the Actions tab", () => {
  it("keeps the subscription row, trial dates and billing history; access unchanged", async () => {
    const before = { ...seedSubscription({ plan: "starter", plan_family: "starter", plan_slug: "starter_monthly", amount: 50 }) };
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, actor, { user_id: USER, plan: "growth" });

    const after = tables.subscriptions[0];
    expect(after.plan_family).toBe("growth");
    expect(after.trial_ends_at).toBe(before.trial_ends_at);
    expect(after.trial_started_at).toBe(before.trial_started_at);
    expect(after.payfast_token).toBe(before.payfast_token);
    expect(after.status).toBe("active");
    expect(tables.subscriptions).toHaveLength(1);
    expect((await entitlement()).plan).toBe("growth");
  });

  it("a paused account stays paused when its package changes", async () => {
    seedSubscription({ status: "suspended", admin_override: true, plan_family: "starter", plan_slug: "starter_monthly" });
    const { res } = resMock();
    await handleAdminSetCompanyPlan(res, memory, actor, { user_id: USER, plan: "business" });
    expect(tables.subscriptions[0]).toMatchObject({ plan_family: "business", status: "suspended" });
    expect((await entitlement()).accessGranted).toBe(false);
  });
});

describe("account access shown in the admin directory is derived, not stored", () => {
  it.each([
    [null, "none"],
    [{ status: "active" }, "active"],
    [{ status: "suspended" }, "paused"],
    [{ status: "pending" }, "pending"],
    [{ status: "processing" }, "pending"],
    [{ status: "expired" }, "expired"],
    [{ status: "cancelled" }, "expired"],
    [{ status: "trialing", trial_ends_at: new Date(Date.now() + DAY).toISOString() }, "active"],
    [{ status: "trialing", trial_ends_at: new Date(Date.now() - DAY).toISOString() }, "expired"],
    [{ status: "past_due", grace_ends_at: new Date(Date.now() + DAY).toISOString() }, "active"],
    [{ status: "past_due" }, "expired"],
  ])("%o → %s", (row, expected) => {
    expect(accountAccessStatus(row)).toBe(expected);
  });
});

describe("regression: no admin user action writes profiles.status", () => {
  const read = (rel) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

  it.each([
    "src/components/users/UserFormDialog.jsx",
    "src/pages/UsersPage.jsx",
    "server/src/adminPlatformUsersList.js",
  ])("%s does not send or read a profiles status column", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/status:\s*form\.status/);
    expect(src).not.toMatch(/data:\s*\{\s*status/);
    expect(src).not.toMatch(/profile\?\.status/);
  });
});
