/**
 * Employee portal (/employee/<slug>) on the REAL schema: every migration replayed on PGlite, queried as
 * signed-in users through RLS like PostgREST.
 *
 *   COMPANY SLUG      → identifies the workforce portal (never grants access)
 *   AUTHENTICATED USER→ identifies the person
 *   EMPLOYMENT        → active membership in THAT org
 *   ROLE/PERMISSIONS  → what they can do
 *   RLS / RPC         → enforces it
 *
 * Cast — Padosio (owner) employs: employee@example.com (activated by invite), a till cashier, a department
 * manager, a payroll (finance) manager, an HR manager. employee@example.com later owns "My Personal
 * Business". "Another Company" is an unrelated tenant.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";
import {
  employeePortalPath,
  isValidPortalSlug,
  slugifyPortalName,
} from "../../shared/workforce/portalSlug.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params, opts) => runAs(db, user, sql, params, opts);
const rowsAs = async (user, sql, params, opts) => {
  const r = await as(user, sql, params, opts);
  if (!r.ok) throw new Error(`${user}: ${r.message}`);
  return r.rows;
};
const rpc = async (user, fn, arg) => (await rowsAs(user, `select public.${fn}($1) as r`, [arg]))[0].r;

const U = {
  owner: "e0000000-0000-4000-8000-000000000001",
  emp: "e0000000-0000-4000-8000-000000000002", // employee@example.com
  cashier: "e0000000-0000-4000-8000-000000000003",
  dept: "e0000000-0000-4000-8000-000000000004",
  payroll: "e0000000-0000-4000-8000-000000000005",
  hr: "e0000000-0000-4000-8000-000000000006",
  otherOwner: "e0000000-0000-4000-8000-000000000007",
  stranger: "e0000000-0000-4000-8000-000000000008",
  superAdmin: "e0000000-0000-4000-8000-000000000009",
};
const ORG = {};
const ROW = {};
const SUPER_CLAIMS = { claims: { app_metadata: { role: "admin" } } };

async function signUp(id, email, orgName) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ org_name: orgName }),
  ]);
  const { id: orgId } = await one(`select id from public.organizations where owner_id = $1`, [id]);
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     values ($1, $2, $3, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly',
       now() + interval '30 days')`,
    [id, email, orgId]
  );
  return orgId;
}

async function invitedUser(id, email) {
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [
    id,
    email,
    JSON.stringify({ pending_company_invite: "true" }),
  ]);
}

async function member(orgId, userId, role, fn) {
  return (
    await one(
      `insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, $4) returning id`,
      [orgId, userId, role, fn]
    )
  ).id;
}

async function invite(orgId, email, { membershipId = null, expires = "7 days", role = "employee", fn = "general" } = {}) {
  const token = `tok-${Math.random().toString(16).slice(2)}${Date.now()}`;
  await q(
    `insert into public.company_invites (org_id, email, role, job_function, token, status, expires_at, membership_id)
     values ($1, $2, $3, $4, $5, 'pending', now() + $6::interval, $7)`,
    [orgId, email, role, fn, token, expires, membershipId]
  );
  return token;
}

beforeAll(async () => {
  db = await replaySupabaseSchema();

  ORG.padosio = await signUp(U.owner, "owner@padosio.test", "Padosio");
  ORG.other = await signUp(U.otherOwner, "owner@another.test", "Another Company");

  // Roster employee created by the employer (no login yet) → invited → activates with their own account.
  ROW.empMembership = (
    await one(
      `insert into public.memberships (org_id, user_id, role, job_function, invited_email)
       values ($1, null, 'employee', 'general', 'employee@example.com') returning id`,
      [ORG.padosio]
    )
  ).id;
  ROW.empInvite = await invite(ORG.padosio, "employee@example.com", { membershipId: ROW.empMembership });
  await invitedUser(U.emp, "employee@example.com");

  for (const [id, email] of [
    [U.cashier, "till@padosio.test"],
    [U.dept, "dept@padosio.test"],
    [U.payroll, "payroll@padosio.test"],
    [U.hr, "hr@padosio.test"],
  ]) {
    await invitedUser(id, email);
  }
  ROW.cashierMembership = await member(ORG.padosio, U.cashier, "employee", "pos");
  await member(ORG.padosio, U.dept, "manager", "operations");
  await member(ORG.padosio, U.payroll, "manager", "finance");
  await member(ORG.padosio, U.hr, "manager", "hr");
  await q(`insert into auth.users (id, email) values ($1, 'stranger@nowhere.test'), ($2, 'root@paidly.test')`, [
    U.stranger,
    U.superAdmin,
  ]);

  // Padosio business data
  ROW.invPadosio = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'P-1', 'paid', 9999, $2, $2) returning id`,
      [ORG.padosio, U.owner]
    )
  ).id;
  await q(`insert into public.payments (org_id, invoice_id, amount) values ($1, $2, 9999)`, [
    ORG.padosio,
    ROW.invPadosio,
  ]);
  await q(`insert into public.expenses (org_id, amount, created_by_id) values ($1, 77, $2)`, [ORG.padosio, U.owner]);
  await q(`insert into public.clients (org_id, name, created_by_id) values ($1, 'Padosio client', $2)`, [
    ORG.padosio,
    U.owner,
  ]);
  ROW.payslipCashier = (
    await one(
      `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, net_pay, payslip_number)
       values ($1, $2, $3, 'Cashier', 5000, 'PS-CASH') returning id`,
      [ORG.padosio, ROW.cashierMembership, U.cashier]
    )
  ).id;
  ROW.payslipEmp = (
    await one(
      `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, net_pay, payslip_number)
       values ($1, $2, $3, 'Employee', 8000, 'PS-EMP') returning id`,
      [ORG.padosio, ROW.empMembership, U.emp]
    )
  ).id;
  ROW.leaveType = (
    await one(`insert into public.leave_types (org_id, name, code) values ($1, 'Annual', 'annual') returning id`, [
      ORG.padosio,
    ])
  ).id;
  ROW.empProfile = (
    await one(
      `insert into public.payroll_profiles (org_id, membership_id, user_id, full_name) values ($1, $2, $3, 'Employee')
       returning id`,
      [ORG.padosio, ROW.empMembership, U.emp]
    )
  ).id;
  await q(
    `insert into public.leave_requests (org_id, user_id, payroll_profile_id, leave_type_id, start_date, end_date,
       status, employee_id)
     values ($1, $2, $3, $4, current_date, current_date, 'pending', $5)`,
    [ORG.padosio, U.emp, ROW.empProfile, ROW.leaveType, ROW.empMembership]
  );

  // Another Company data
  ROW.invOther = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'O-1', 'paid', 4321, $2, $2) returning id`,
      [ORG.other, U.otherOwner]
    )
  ).id;
  ROW.payslipOther = (
    await one(
      `insert into public.payslips (org_id, membership_id, employee_name, net_pay, payslip_number)
       values ($1, (select id from public.memberships where org_id = $1 limit 1), 'Other', 1, 'PS-O') returning id`,
      [ORG.other]
    )
  ).id;
}, 180_000);

describe("URL rules: company portal slug", () => {
  it("is generated from the business name, URL-safe and without ids", async () => {
    const { portal_slug } = await one(`select portal_slug from public.organizations where id = $1`, [ORG.padosio]);
    expect(portal_slug).toBe("padosio");
    expect(employeePortalPath(portal_slug, "https://paidly.co.za")).toBe("https://paidly.co.za/employee/padosio");
    const slugs = (await q(`select portal_slug from public.organizations`)).map((r) => r.portal_slug);
    for (const s of slugs) {
      expect(isValidPortalSlug(s), s).toBe(true);
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // never a UUID
    }
  });

  it("JS and SQL slugify agree", async () => {
    for (const name of ["Padosio", "Padosio Restaurant & Events", "Café Zoë & Co.", "  --Łódź  Bakery-- "]) {
      const { s } = await one(`select public.slugify_portal_name($1) as s`, [name]);
      expect(slugifyPortalName(name), name).toBe(s);
    }
    expect(slugifyPortalName("Padosio Restaurant & Events")).toBe("padosio-restaurant-events");
  });

  it("collisions get an alternative; reserved words and empty names never become slugs", async () => {
    const mk = async (name) =>
      (await one(`insert into public.organizations (name, owner_id) values ($1, $2) returning portal_slug`, [name, U.stranger]))
        .portal_slug;
    expect(await mk("Padosio")).toBe("padosio-2");
    expect(await mk("PADOSIO!!")).toBe("padosio-3");
    expect(await mk("Admin")).toBe("admin-2");
    expect(await mk("Login")).toBe("login-2");
    expect(await mk("&&")).toMatch(/^team(-\d+)?$/);
    expect(await mk("Z")).toMatch(/^team-z(-\d+)?$/);
  });

  it("is stable when the business is renamed", async () => {
    await q(`update public.organizations set name = 'Padosio Restaurant & Events' where id = $1`, [ORG.padosio]);
    const { portal_slug } = await one(`select portal_slug from public.organizations where id = $1`, [ORG.padosio]);
    expect(portal_slug).toBe("padosio");
  });

  it("owner-chosen slugs are validated: taken, reserved, unsafe and blank are refused", async () => {
    const set = (slug) =>
      as(U.otherOwner, `update public.organizations set portal_slug = $2 where id = $1 returning portal_slug`, [
        ORG.other,
        slug,
      ]);
    expect((await set("padosio")).ok).toBe(false); // taken
    expect((await set("admin")).ok).toBe(false); // reserved
    expect((await set("api")).ok).toBe(false);
    expect((await set("bad slug!")).ok).toBe(false);
    expect((await set("../x")).ok).toBe(false);
    expect((await set(ORG.padosio)).ok).toBe(false); // id-shaped slugs are refused
    const blank = await set("");
    expect(blank.rows[0].portal_slug).toBe("another-company"); // cannot be cleared
    const ok = await set("Another-Co");
    expect(ok.rows[0].portal_slug).toBe("another-co"); // normalised
    await set("another-company");
  });

  it("an employee cannot change their employer's portal slug", async () => {
    const r = await as(U.emp, `update public.organizations set portal_slug = 'hijack' where id = $1 returning id`, [
      ORG.padosio,
    ]);
    expect(r.rows ?? []).toEqual([]);
  });

  it("public lookup returns branding only — no ids — and nothing for unknown/reserved slugs", async () => {
    const pub = await rpc(null, "get_workforce_portal", "padosio");
    expect(Object.keys(pub).sort()).toEqual(["company_name", "found", "logo_url", "slug"]);
    expect(JSON.stringify(pub)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    for (const slug of ["nonexistent", "admin", "login", "api", "settings", "", "../etc", ORG.padosio]) {
      expect(await rpc(null, "get_workforce_portal", slug), slug).toEqual({ found: false });
    }
  });
});

describe("activation (invitation → employee account)", () => {
  it("invalid token is rejected", async () => {
    expect((await rpc(U.emp, "accept_company_invite_token", "nope")).error).toBe("not_found");
  });

  it("expired token is rejected", async () => {
    const t = await invite(ORG.padosio, "expired@padosio.test", { expires: "-1 hour" });
    expect((await rpc(U.emp, "accept_company_invite_token", t)).error).toBe("expired");
    expect((await rpc(U.stranger, "validate_company_invite_token", t)).error).toBe("expired");
  });

  it("token for a different email is rejected (invite bound to the invited person)", async () => {
    expect((await rpc(U.stranger, "accept_company_invite_token", ROW.empInvite)).error).toBe("email_mismatch");
  });

  it("valid token activates: the roster membership is linked to the new account (not owner/admin)", async () => {
    expect((await rpc(null, "get_workforce_portal", "padosio")).found).toBe(true);
    const before = await rpc(U.emp, "resolve_my_workforce_portal", "padosio");
    expect(before).toEqual({ ok: false, reason: "no_employment" });

    const r = await rpc(U.emp, "accept_company_invite_token", ROW.empInvite);
    expect(r).toMatchObject({ ok: true, role: "employee", scope: "paidly" });
    const m = await one(`select user_id, role from public.memberships where id = $1`, [ROW.empMembership]);
    expect(m).toEqual({ user_id: U.emp, role: "employee" });
  });

  it("used token cannot be reused", async () => {
    expect((await rpc(U.emp, "accept_company_invite_token", ROW.empInvite)).error).toBe("not_pending");
  });

  it("revoked invitation is rejected", async () => {
    const t = await invite(ORG.padosio, "late@padosio.test");
    await q(`update public.company_invites set status = 'revoked', revoked_at = now() where token = $1`, [t]);
    expect((await rpc(U.stranger, "validate_company_invite_token", t)).error).toBe("revoked");
  });

  it("activated employee resolves their portal", async () => {
    const r = await rpc(U.emp, "resolve_my_workforce_portal", "padosio");
    expect(r).toMatchObject({
      ok: true,
      slug: "padosio",
      org_id: ORG.padosio,
      membership_id: ROW.empMembership,
      role: "employee",
      company_role: "employee",
      is_owner: false,
      pos_enabled: false,
    });
  });
});

describe("portal authorization (slug is not authentication)", () => {
  it("non-employee, anonymous and other-company users are denied", async () => {
    expect(await rpc(U.stranger, "resolve_my_workforce_portal", "padosio")).toEqual({ ok: false, reason: "no_employment" });
    expect(await rpc(U.otherOwner, "resolve_my_workforce_portal", "padosio")).toEqual({
      ok: false,
      reason: "no_employment",
    });
    expect((await as(null, `select public.resolve_my_workforce_portal('padosio')`)).ok).toBe(false); // anon: no EXECUTE
  });

  it("changing the slug never grants another company's portal", async () => {
    for (const slug of ["another-company", "nonexistent", "admin", "padosio-2", "x".repeat(60), "padosio/../other"]) {
      const r = await rpc(U.emp, "resolve_my_workforce_portal", slug);
      expect(r.ok, slug).toBe(false);
    }
  });

  it("internal ids cannot be used in place of the slug", async () => {
    for (const id of [ORG.padosio, ROW.empMembership, U.emp]) {
      expect((await rpc(U.emp, "resolve_my_workforce_portal", id)).ok).toBe(false);
      expect(await rpc(null, "get_workforce_portal", id)).toEqual({ found: false });
    }
  });

  it("the owner resolves their own portal as owner", async () => {
    expect(await rpc(U.owner, "resolve_my_workforce_portal", "padosio")).toMatchObject({
      ok: true,
      role: "owner",
      is_owner: true,
      pos_enabled: true,
    });
  });
});

describe("role-based access inside Padosio", () => {
  const caps = (user, opts) =>
    rowsAs(
      user,
      `select public.can_view_org_financials($1) as financials, public.can_manage_org_payroll($1) as payroll,
              public.can_see_org_workforce($1) as workforce, public.org_has_pos_permission($1, 'pos_sell') as pos_sell,
              public.org_has_pos_permission($1, 'pos_view_reports') as pos_reports,
              (select count(*)::int from public.payslips where org_id = $1) as payslips,
              (select count(*)::int from public.payments where org_id = $1) as payments,
              (select count(*)::int from public.leave_requests where org_id = $1) as leave`,
      [ORG.padosio],
      opts
    ).then((r) => r[0]);

  it("Employee: own data only", async () => {
    expect(await caps(U.emp)).toEqual({
      financials: false, payroll: false, workforce: false, pos_sell: true, pos_reports: false,
      payslips: 1, payments: 0, leave: 1,
    });
    const own = await rowsAs(U.emp, `select id from public.payslips`);
    expect(own.map((r) => r.id)).toEqual([ROW.payslipEmp]);
  });

  it("POS employee: till + own self-service only — no revenue, reports, payroll or business admin", async () => {
    expect(await caps(U.cashier)).toEqual({
      financials: false, payroll: false, workforce: false, pos_sell: true, pos_reports: false,
      payslips: 1, payments: 0, leave: 0, // their own payslip (employee_user_id), nobody else's
    });
    expect(await rpc(U.cashier, "resolve_my_workforce_portal", "padosio")).toMatchObject({ ok: true, pos_enabled: true });
    const [{ admin }] = await rowsAs(U.cashier, `select public.is_company_admin_for_org($1) as admin`, [ORG.padosio]);
    expect(admin).toBe(false);
  });

  it("Department manager: team leave + POS reports; not payroll, not other payslips", async () => {
    expect(await caps(U.dept)).toEqual({
      financials: true, payroll: false, workforce: false, pos_sell: true, pos_reports: true,
      payslips: 0, payments: 1, leave: 1,
    });
  });

  it("Payroll (finance manager): company payroll", async () => {
    expect(await caps(U.payroll)).toMatchObject({ payroll: true, workforce: true, payslips: 2 });
  });

  it("HR manager: workforce directory, but not payslips", async () => {
    expect(await caps(U.hr)).toMatchObject({ payroll: false, workforce: true, payslips: 0 });
  });

  it("Business owner: everything in their business", async () => {
    expect(await caps(U.owner)).toEqual({
      financials: true, payroll: true, workforce: true, pos_sell: true, pos_reports: true,
      payslips: 2, payments: 1, leave: 1,
    });
  });

  it("Super admin (platform JWT role): cross-tenant read for support", async () => {
    const [{ n }] = await rowsAs(U.superAdmin, `select count(*)::int as n from public.payslips`, [], SUPER_CLAIMS);
    expect(n).toBeGreaterThanOrEqual(3);
    const [{ n: plain }] = await rowsAs(U.superAdmin, `select count(*)::int as n from public.payslips`);
    expect(plain).toBe(0); // same user without the server-issued claim: nothing
  });
});

describe("same email: employee@example.com owns a separate business", () => {
  beforeAll(async () => {
    ORG.personal = (
      await one(`insert into public.organizations (name, owner_id) values ('My Personal Business', $1) returning id`, [
        U.emp,
      ])
    ).id;
    await member(ORG.personal, U.emp, "owner", "general");
    await q(
      `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
         plan_family, amount, currency, billing_cycle, current_period_end)
       values ($1, 'employee@example.com', $2, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR',
         'monthly', now() + interval '30 days')`,
      [U.emp, ORG.personal]
    );
    ROW.invPersonal = (
      await one(
        `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
         values ($1, 'MY-1', 'paid', 123, $2, $2) returning id`,
        [ORG.personal, U.emp]
      )
    ).id;
    await q(`insert into public.payments (org_id, invoice_id, amount) values ($1, $2, 123)`, [
      ORG.personal,
      ROW.invPersonal,
    ]);
  });

  it("business context = their own business; Padosio stays an employment", async () => {
    const [{ ctx }] = await rowsAs(U.emp, `select public.get_my_tenant_context() as ctx`);
    expect(ctx.company_id).toBe(ORG.personal);
    expect(await rpc(U.emp, "resolve_my_workforce_portal", "padosio")).toMatchObject({
      ok: true,
      role: "employee",
      is_owner: false,
    });
    const portals = await rowsAs(U.emp, `select slug, role from public.my_workforce_portals()`);
    expect(portals).toEqual([{ slug: "padosio", role: "employee" }]);
  });

  it("own business: full data; Padosio: no revenue, invoices, quotes, clients, expenses, other payroll", async () => {
    const pays = await rowsAs(U.emp, `select org_id, amount::numeric as amount from public.payments`);
    expect(pays).toEqual([{ org_id: ORG.personal, amount: "123.00" }]);
    for (const table of ["invoices", "quotes", "clients", "expenses", "banking_details", "pos_sales_events"]) {
      expect(await rowsAs(U.emp, `select id from public.${table} where org_id = $1`, [ORG.padosio]), table).toEqual([]);
    }
    expect(await rowsAs(U.emp, `select id from public.payslips where id = $1`, [ROW.payslipCashier])).toEqual([]);
    expect(await rowsAs(U.emp, `select id from public.payment_history where company_id = $1`, [ORG.padosio])).toEqual([]);
  });

  it("Padosio (owner) never sees the personal business", async () => {
    expect(await rowsAs(U.owner, `select id from public.invoices where org_id = $1`, [ORG.personal])).toEqual([]);
    expect(await rowsAs(U.owner, `select id from public.payments where org_id = $1`, [ORG.personal])).toEqual([]);
    expect(await rowsAs(U.owner, `select id from public.organizations where id = $1`, [ORG.personal])).toEqual([]);
  });
});

describe("cross-company RLS for a Padosio employee", () => {
  it("SELECT / INSERT / UPDATE / DELETE on Another Company is denied", async () => {
    expect(await rowsAs(U.emp, `select id from public.invoices where id = $1`, [ROW.invOther])).toEqual([]);
    expect(await rowsAs(U.emp, `select id from public.payslips where id = $1`, [ROW.payslipOther])).toEqual([]);
    const ins = await as(
      U.emp,
      `insert into public.invoices (org_id, invoice_number, total_amount, user_id, created_by) values ($1, 'x', 1, auth.uid(), auth.uid())`,
      [ORG.other]
    );
    expect(ins.ok).toBe(false);
    const upd = await as(U.emp, `update public.invoices set total_amount = 1 where id = $1 returning id`, [ROW.invOther]);
    expect(upd.rows ?? []).toEqual([]);
    const del = await as(U.emp, `delete from public.invoices where id = $1 returning id`, [ROW.invOther]);
    expect(del.rows ?? []).toEqual([]);
    expect((await one(`select count(*)::int as n from public.invoices where id = $1`, [ROW.invOther])).n).toBe(1);
  });

  it("employee payroll isolation: never a colleague's payslip, even by id", async () => {
    expect(await rowsAs(U.emp, `select id from public.payslips where id = $1`, [ROW.payslipCashier])).toEqual([]);
    expect(await rowsAs(U.cashier, `select id from public.payslips where id = $1`, [ROW.payslipEmp])).toEqual([]);
  });
});

describe("revocation", () => {
  it("POS permission revoked → no till permission, portal still open", async () => {
    await q(`update public.memberships set pos_access_disabled_at = now() where id = $1`, [ROW.cashierMembership]);
    const [{ sell }] = await rowsAs(U.cashier, `select public.org_has_pos_permission($1, 'pos_sell') as sell`, [ORG.padosio]);
    expect(sell).toBe(false);
    expect(await rpc(U.cashier, "resolve_my_workforce_portal", "padosio")).toMatchObject({ ok: true, pos_enabled: false });
    await q(`update public.memberships set pos_access_disabled_at = null where id = $1`, [ROW.cashierMembership]);
  });

  const insertClient = () =>
    as(U.emp, `insert into public.clients (org_id, name, created_by_id) values ($1, 'mine', auth.uid())`, [ORG.padosio]);

  it("portal revoked → portal denied and the same (still signed-in) user reads nothing in Padosio", async () => {
    expect(await rowsAs(U.emp, `select id from public.payslips where org_id = $1`, [ORG.padosio])).toHaveLength(1);
    expect((await insertClient()).ok).toBe(true); // allowed while active
    await q(`update public.memberships set portal_revoked_at = now() where id = $1`, [ROW.empMembership]);

    expect(await rpc(U.emp, "resolve_my_workforce_portal", "padosio")).toEqual({ ok: false, reason: "revoked" });
    for (const table of ["payslips", "leave_requests", "services", "clients", "documents", "pos_registers"]) {
      expect(await rowsAs(U.emp, `select id from public.${table} where org_id = $1`, [ORG.padosio]), table).toEqual([]);
    }
    expect(await rowsAs(U.emp, `select id from public.organizations where id = $1`, [ORG.padosio])).toEqual([]);
    const [{ sell }] = await rowsAs(U.emp, `select public.org_has_pos_permission($1, 'pos_sell') as sell`, [ORG.padosio]);
    expect(sell).toBe(false);
    const ins = await insertClient();
    expect(ins).toMatchObject({ ok: false, code: "42501" }); // RLS, not a constraint
    expect(await rowsAs(U.emp, `select slug from public.my_workforce_portals()`)).toEqual([]);
  });

  it("revocation in Padosio does not touch their own business", async () => {
    const pays = await rowsAs(U.emp, `select amount from public.payments where org_id = $1`, [ORG.personal]);
    expect(pays).toHaveLength(1);
    expect(await rpc(U.emp, "resolve_my_workforce_portal", "another-company")).toEqual({ ok: false, reason: "no_employment" });
  });

  it("the old invitation cannot re-activate a revoked employee", async () => {
    expect((await rpc(U.emp, "accept_company_invite_token", ROW.empInvite)).ok).toBe(false);
    expect(await rpc(U.emp, "resolve_my_workforce_portal", "padosio")).toEqual({ ok: false, reason: "revoked" });
  });

  it("deactivated (disabled) manager loses management rights too", async () => {
    await q(`update public.memberships set disabled_at = now() where org_id = $1 and user_id = $2`, [ORG.padosio, U.payroll]);
    expect(await rpc(U.payroll, "resolve_my_workforce_portal", "padosio")).toEqual({ ok: false, reason: "deactivated" });
    const [{ payroll }] = await rowsAs(U.payroll, `select public.can_manage_org_payroll($1) as payroll`, [ORG.padosio]);
    expect(payroll).toBeFalsy(); // NULL (no active role) — a deny in every policy
    expect(await rowsAs(U.payroll, `select id from public.payslips where org_id = $1`, [ORG.padosio])).toEqual([]);
  });

  it("re-enabling restores access (revocation is a state, not deletion)", async () => {
    await q(`update public.memberships set portal_revoked_at = null where id = $1`, [ROW.empMembership]);
    expect(await rpc(U.emp, "resolve_my_workforce_portal", "padosio")).toMatchObject({ ok: true });
    expect(await rowsAs(U.emp, `select id from public.payslips where org_id = $1`, [ORG.padosio])).toHaveLength(1);
  });
});
