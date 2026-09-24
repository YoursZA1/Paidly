/**
 * Follow-up fixes (2026-09-24): one enforcement default, grandfathered payslip limit, catalog vs
 * inventory split, company email templates, and plan gates on Workforce pages.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const { memory, tables } = vi.hoisted(() => {
  const tables = { subscriptions: [], profiles: [], memberships: [], organizations: [], company_invites: [], subscription_events: [], audit_logs: [], payslips: [] };

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
vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async (req) => (req.headers?.user ? { user: { id: req.headers.user } } : { user: null, error: "Unauthorized" }),
}));
vi.mock("../../server/src/companyRouteAccess.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCompanyMembership: async (_sb, userId) => ({ companyId: COMPANY, orgId: COMPANY, userId, role: "owner", isOwner: true }),
    membershipHasPermission: () => true,
  };
});

import { entitlementsEnforceEnabled } from "../../server/src/billing/entitlements.js";
import { assertPayrollEmployeeCapacity, payrollEmployeeCapacity } from "../../server/src/payroll/payrollEmployeeLimit.js";
import { handleCompanyEmailTemplates } from "../../server/src/company/emailTemplatesRoute.js";
import { catalogItemFeature, checkPayslipCapacity } from "../../shared/planFeatures.js";
import {
  DEFAULT_EMAIL_TEMPLATES,
  effectiveEmailTemplate,
  normalizeEmailTemplates,
  renderEmailTemplate,
} from "../../shared/emailTemplates.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function seedPlan(plan, status = "active") {
  tables.organizations.push({ id: COMPANY, owner_id: OWNER, created_at: iso(-30 * DAY), email_templates: {} });
  tables.subscriptions.push({
    id: randomUUID(), company_id: COMPANY, user_id: OWNER, status,
    plan, plan_family: plan, plan_slug: `${plan}_monthly`, updated_at: iso(-DAY), created_at: iso(-DAY),
  });
}

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k] = [];
});

describe("1. one enforcement default (server = database)", () => {
  const withEnv = (value, fn) => {
    const prev = { e: process.env.PAIDLY_ENTITLEMENTS_ENFORCE, v: process.env.VERCEL_ENV };
    if (value === undefined) delete process.env.PAIDLY_ENTITLEMENTS_ENFORCE;
    else process.env.PAIDLY_ENTITLEMENTS_ENFORCE = value;
    process.env.VERCEL_ENV = "production";
    try { return fn(); } finally {
      if (prev.e === undefined) delete process.env.PAIDLY_ENTITLEMENTS_ENFORCE; else process.env.PAIDLY_ENTITLEMENTS_ENFORCE = prev.e;
      if (prev.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prev.v;
    }
  };
  it("unset on production enforces, like the database guard", () => {
    expect(withEnv(undefined, entitlementsEnforceEnabled)).toBe(true);
  });
  it.each(["false", "0", "off", "report"])("%s is the log-only rollback", (v) => {
    expect(withEnv(v, entitlementsEnforceEnabled)).toBe(false);
  });
  it("database default is enforce too", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20260924120000_plan_feature_db_guard.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/current_setting\('app\.paidly_entitlements_enforce', true\), 'on'\) = 'off'/);
  });
});

describe("2. payslip limit grandfathers employees already paid", () => {
  it("pure rule", () => {
    expect(checkPayslipCapacity({ limit: 1, issuedKeys: ["a", "b", "c"], requestedKeys: ["a", "b", "c"] }).ok).toBe(true);
    expect(checkPayslipCapacity({ limit: 1, issuedKeys: ["a", "b", "c"], requestedKeys: ["d"] })).toMatchObject({ ok: false, newKeys: ["d"], used: 3 });
    expect(checkPayslipCapacity({ limit: 4, issuedKeys: ["a"], requestedKeys: ["a", "b", "c", "d"] }).ok).toBe(true);
    expect(checkPayslipCapacity({ limit: 4, issuedKeys: ["a"], requestedKeys: ["a", "b", "c", "d", "e"] }).ok).toBe(false);
    expect(checkPayslipCapacity({ limit: null, issuedKeys: [], requestedKeys: ["x", "y"] }).ok).toBe(true);
  });

  it("downgraded Business → Starter with 3 paid employees keeps paying them; a 4th is refused", async () => {
    seedPlan("starter");
    const staff = ["m1", "m2", "m3"].map((id) => ({ membership_id: id, full_name: id.toUpperCase() }));
    for (const e of staff) tables.payslips.push({ org_id: COMPANY, membership_id: e.membership_id, employee_name: e.full_name });
    await expect(assertPayrollEmployeeCapacity(COMPANY, staff, { supabase: memory })).resolves.toBeUndefined();
    const withNew = [...staff, { membership_id: "m4", full_name: "Newbie" }];
    const cap = await payrollEmployeeCapacity(COMPANY, withNew, { supabase: memory });
    expect(cap).toMatchObject({ ok: false, used: 3, blockedEmployees: ["Newbie"], upgradeTo: "business" });
    await expect(assertPayrollEmployeeCapacity(COMPANY, withNew, { supabase: memory })).rejects.toMatchObject({ status: 403, code: "PAYROLL_EMPLOYEE_LIMIT" });
  });

  it("Business: a 5th employee with none paid yet is refused; Growth never", async () => {
    seedPlan("business");
    const five = [1, 2, 3, 4, 5].map((n) => ({ membership_id: `m${n}` }));
    expect((await payrollEmployeeCapacity(COMPANY, five, { supabase: memory })).ok).toBe(false);
    tables.subscriptions[0].plan_slug = "growth_monthly";
    tables.subscriptions[0].plan_family = "growth";
    expect((await payrollEmployeeCapacity(COMPANY, five, { supabase: memory })).ok).toBe(true);
  });

  it("the database guard uses the same grandfathering (existing employee never blocked)", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20260924120000_plan_feature_db_guard.sql", import.meta.url), "utf8");
    expect(sql).toContain("Grandfathered: an employee who already has a payslip is never blocked.");
    expect(sql).toMatch(/IF v_key IS NOT NULL AND NOT EXISTS/);
  });
});

describe("3. catalog: services on every plan, stock-tracked products are Inventory", () => {
  it.each([
    ["service", "invoices"], ["labor", "invoices"], ["material", "invoices"], ["expense", "invoices"],
    [undefined, "invoices"], ["product", "inventory"], ["PRODUCT", "inventory"],
  ])("%s → %s", (type, feature) => {
    expect(catalogItemFeature(type)).toBe(feature);
  });

  it("DB guard mirrors it and guards manual stock moves", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20260924120000_plan_feature_db_guard.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/ARRAY\['services', 'catalog'\]/);
    expect(sql).toMatch(/= 'product' THEN 'inventory' ELSE 'invoices'/);
    expect(sql).toMatch(/adjust_inventory_stock[\s\S]*paidly_assert_plan_feature\('inventory', p_org_id/);
  });

  it("Products page is no longer plan-gated; its stock actions are", () => {
    const routes = readFileSync(new URL("../../src/pages/index.jsx", import.meta.url), "utf8");
    expect(routes).toContain('{ path: "/Services", element: ownerRoute(<Services />) }');
    const page = readFileSync(new URL("../../src/pages/Inventory.jsx", import.meta.url), "utf8");
    for (const action of ["onAddProduct={withInventory(", "onOpenTools={withInventory(", "onReorder={withInventory(handleReorder)}"]) {
      expect(page).toContain(action);
    }
  });
});

describe("4. email templates (Business+), enforced by the server route", () => {
  const call = async (method, body) => {
    const out = { status: 0, body: null };
    const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
    await handleCompanyEmailTemplates({ method, headers: { user: OWNER }, body }, res);
    return out;
  };
  const templates = { invoice: { subject: "Inv {document_number}", message: "Hi {client_name}" } };

  it("Starter: GET returns defaults-only (allowed=false); PUT is refused", async () => {
    seedPlan("starter");
    expect(await call("GET")).toEqual({ status: 200, body: { templates: {}, allowed: false } });
    const put = await call("PUT", { templates });
    expect(put).toMatchObject({ status: 403, body: { code: "UPGRADE_REQUIRED", feature: "email_templates" } });
    expect(tables.organizations[0].email_templates).toEqual({});
  });

  it("Business: PUT saves, GET returns them", async () => {
    seedPlan("business");
    expect(await call("PUT", { templates })).toMatchObject({ status: 200, body: { allowed: true } });
    expect(tables.organizations[0].email_templates).toEqual(templates);
    expect(await call("GET")).toEqual({ status: 200, body: { templates, allowed: true } });
  });

  it("expired Business trial: treated like no entitlement", async () => {
    seedPlan("business", "expired");
    expect((await call("PUT", { templates })).status).toBe(403);
  });

  it("rejects oversized fields", async () => {
    seedPlan("growth");
    const r = await call("PUT", { templates: { quote: { subject: "x".repeat(201), message: "" } } });
    expect(r.status).toBe(400);
  });

  it("render / defaults / normalise", () => {
    expect(renderEmailTemplate("Hi {client_name}, {document_number} {unknown}", { client_name: "Ann", document_number: "INV-7" })).toBe("Hi Ann, INV-7 {unknown}");
    expect(effectiveEmailTemplate({ invoice: { subject: "Mine", message: "" } }, "invoice", true)).toEqual({ subject: "Mine", message: DEFAULT_EMAIL_TEMPLATES.invoice.message });
    expect(effectiveEmailTemplate({ invoice: { subject: "Mine" } }, "invoice", false)).toEqual(DEFAULT_EMAIL_TEMPLATES.invoice);
    expect(normalizeEmailTemplates({ invoice: { subject: " S ", message: "M\r\nN" }, bogus: {} })).toEqual({ invoice: { subject: "S", message: "M\nN" } });
  });
});

describe("5. admin plan changes reach logged-in users via realtime", () => {
  it("profile realtime events re-read the company entitlement", () => {
    const bridge = readFileSync(new URL("../../src/components/auth/ProfileRealtimeBridge.jsx", import.meta.url), "utf8");
    expect(bridge).toMatch(/invalidateQueries\(\{ queryKey: \[SUBSCRIPTION_CURRENT_QUERY_ROOT\] \}\)/);
  });
});

describe("6. Workforce pages carry plan gates", () => {
  const routes = readFileSync(new URL("../../src/pages/index.jsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../../src/lib/workforceNav.js", import.meta.url), "utf8");
  it("Reports → payroll, Organisation → departments, People calendar → every plan", () => {
    expect(routes).toContain('planGate("payroll", <WorkforceReports />)');
    expect(routes).toContain('planGate("departments", <WorkforceOrganisation />)');
    expect(routes).toMatch(/path: "\/Workforce\/people-calendar"[^\n]*<WorkforcePeopleCalendar \/>/);
    expect(nav).toContain('BarChart2, "payroll")');
    expect(nav).toContain('Network, "departments")');
  });
});
