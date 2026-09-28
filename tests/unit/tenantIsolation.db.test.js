/**
 * Multi-tenant identity / business / employment isolation on the REAL schema (every migration replayed on
 * PGlite), queried as signed-in end users through RLS exactly like PostgREST does.
 *
 * Architectural rule under test:
 *   An employee can be associated with a business without becoming its administrator, while the same
 *   person can independently own another Paidly business without the two contexts ever leaking.
 *
 * Cast (same email = employee@example.com for Employee B's employment AND their own Business B):
 *   Company A  — ownerA; managerA (manager/general); financeA (manager/finance);
 *                empB = cashier (employee/pos) — also owns Business B; empC = employee/sales
 *   Business B — owned by empB
 *   Company Z  — unrelated tenant, ownerZ
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const U = {
  ownerA: "a0000000-0000-4000-8000-000000000001",
  managerA: "a0000000-0000-4000-8000-000000000002",
  financeA: "a0000000-0000-4000-8000-000000000003",
  empB: "b0000000-0000-4000-8000-000000000001",
  empC: "c0000000-0000-4000-8000-000000000001",
  ownerZ: "f0000000-0000-4000-8000-000000000001",
};
const ORG = {};
const ROW = {};

/** Self-signup: handle_new_user creates the user's own org + owner membership + trial. */
async function signUp(id, email, orgName) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ org_name: orgName, plan: "business" }),
  ]);
  return (await one(`select id from public.organizations where owner_id = $1`, [id])).id;
}

/** Invited staff: no personal org is created (pending_company_invite), then the invite is accepted. */
async function inviteInto(orgId, id, email, role, jobFunction) {
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [
    id,
    email,
    JSON.stringify({ pending_company_invite: "true" }),
  ]);
  await addMember(orgId, id, role, jobFunction);
}

/** Active paid Growth plan for the company (the plan-feature guard gates invoices/clients/expenses). */
async function activePlan(ownerId, orgId) {
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     select $1, u.email, $2, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly',
       now() + interval '30 days'
     from auth.users u where u.id = $1`,
    [ownerId, orgId]
  );
}

async function addMember(orgId, userId, role, jobFunction) {
  const row = await one(
    `insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, $4) returning id`,
    [orgId, userId, role, jobFunction]
  );
  return row.id;
}

const as = (user, sql, params) => runAs(db, user, sql, params);
const rowsAs = async (user, sql, params) => {
  const r = await as(user, sql, params);
  if (!r.ok) throw new Error(`${user}: ${r.message}`);
  return r.rows;
};
const sumAs = async (user, table, org) =>
  Number(
    (await rowsAs(user, `select coalesce(sum(amount), 0)::numeric as s from public.${table} where org_id = $1`, [org]))[0]
      .s
  );

beforeAll(async () => {
  db = await replaySupabaseSchema();

  ORG.A = await signUp(U.ownerA, "owner@company-a.test", "Company A");
  ORG.Z = await signUp(U.ownerZ, "owner@company-z.test", "Company Z");
  await inviteInto(ORG.A, U.managerA, "manager@company-a.test", "manager", "general");
  await inviteInto(ORG.A, U.financeA, "finance@company-a.test", "manager", "finance");
  await inviteInto(ORG.A, U.empC, "sales@company-a.test", "employee", "sales");

  // Employee B: invited to Company A as a till cashier …
  await inviteInto(ORG.A, U.empB, "employee@example.com", "employee", "pos");
  ROW.memB_A = (await one(`select id from public.memberships where org_id = $1 and user_id = $2`, [ORG.A, U.empB])).id;
  ROW.memC_A = (await one(`select id from public.memberships where org_id = $1 and user_id = $2`, [ORG.A, U.empC])).id;
  // … later creates their own independent business with the same account / same email.
  ORG.B = (
    await one(`insert into public.organizations (name, owner_id) values ('Business B', $1) returning id`, [U.empB])
  ).id;
  await addMember(ORG.B, U.empB, "owner", "general");
  await activePlan(U.ownerA, ORG.A);
  await activePlan(U.empB, ORG.B);
  await activePlan(U.ownerZ, ORG.Z);

  // --- Company A data -----------------------------------------------------------------------------
  ROW.invA = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'A-INV-1', 'paid', 1000, $2, $2) returning id`,
      [ORG.A, U.ownerA]
    )
  ).id;
  ROW.invC = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'A-INV-2', 'sent', 200, $2, $2) returning id`,
      [ORG.A, U.empC]
    )
  ).id;
  await q(
    `insert into public.invoice_items (invoice_id, service_name, quantity, unit_price, total_price)
     values ($1, 'Consulting', 1, 1000, 1000), ($2, 'Widget', 1, 200, 200)`,
    [ROW.invA, ROW.invC]
  );
  ROW.quoteA = (
    await one(
      `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by)
       values ($1, 'A-Q-1', 'sent', 7777, $2, $2) returning id`,
      [ORG.A, U.ownerA]
    )
  ).id;
  await q(`insert into public.payments (org_id, invoice_id, amount, status) values ($1, $2, 1000, 'completed')`, [
    ORG.A,
    ROW.invA,
  ]);
  await q(`insert into public.payments (org_id, invoice_id, amount, status) values ($1, $2, 200, 'completed')`, [
    ORG.A,
    ROW.invC,
  ]);
  await q(`insert into public.expenses (org_id, amount, created_by_id) values ($1, 50, $2)`, [ORG.A, U.ownerA]);
  ROW.clientA = (
    await one(`insert into public.clients (org_id, name, created_by_id) values ($1, 'Big Client', $2) returning id`, [
      ORG.A,
      U.ownerA,
    ])
  ).id;
  await q(`insert into public.clients (org_id, name, pos_enabled, created_by_id) values ($1, 'Walk-in', true, $2)`, [
    ORG.A,
    U.ownerA,
  ]);
  await q(`insert into public.banking_details (org_id, bank_name, account_number) values ($1, 'Bank A', '123')`, [
    ORG.A,
  ]);
  await q(
    `insert into public.pos_connections (org_id, provider, webhook_token, webhook_secret)
     values ($1, 'generic', 'tok-a', 'SECRET-A')`,
    [ORG.A]
  );
  await q(
    `insert into public.pos_sales_events (org_id, provider, external_id, status, total_amount, occurred_at, cashier_id)
     values ($1, 'paidly', 'sale-b', 'completed', 30, now(), $2), ($1, 'paidly', 'sale-owner', 'completed', 70, now(), $3)`,
    [ORG.A, U.empB, U.ownerA]
  );
  await q(
    `insert into public.payment_history (company_id, amount, payment_status) values ($1, 499, 'COMPLETE')`,
    [ORG.A]
  );

  // Payslips: one each for Employee B and Employee C (Company A payroll)
  ROW.slipB = (
    await one(
      `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, employee_email, net_pay, payslip_number)
       values ($1, $2, $3, 'Employee B', 'employee@example.com', 9000, 'PS-B') returning id`,
      [ORG.A, ROW.memB_A, U.empB]
    )
  ).id;
  ROW.slipC = (
    await one(
      `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, employee_email, net_pay, payslip_number)
       values ($1, $2, $3, 'Employee C', 'sales@company-a.test', 12000, 'PS-C') returning id`,
      [ORG.A, ROW.memC_A, U.empC]
    )
  ).id;

  // --- Business B data (Employee B's own business) --------------------------------------------------
  ROW.invB = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'B-INV-1', 'paid', 555, $2, $2) returning id`,
      [ORG.B, U.empB]
    )
  ).id;
  await q(`insert into public.payments (org_id, invoice_id, amount, status) values ($1, $2, 555, 'completed')`, [
    ORG.B,
    ROW.invB,
  ]);
  await q(`insert into public.expenses (org_id, amount, created_by_id) values ($1, 11, $2)`, [ORG.B, U.empB]);
  ROW.quoteB = (
    await one(
      `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by)
       values ($1, 'B-Q-1', 'sent', 321, $2, $2) returning id`,
      [ORG.B, U.empB]
    )
  ).id;

  // --- Company Z ------------------------------------------------------------------------------------
  ROW.invZ = (
    await one(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'Z-INV-1', 'paid', 4242, $2, $2) returning id`,
      [ORG.Z, U.ownerZ]
    )
  ).id;
  await q(`insert into public.payments (org_id, invoice_id, amount) values ($1, $2, 4242)`, [ORG.Z, ROW.invZ]);
}, 120_000);

describe("identity & business context", () => {
  it("same email does not merge business contexts: tenant context prefers the business the user owns", async () => {
    const [{ ctx }] = await rowsAs(U.empB, `select public.get_my_tenant_context() as ctx`);
    expect(ctx.company_id).toBe(ORG.B);
    expect(ctx.saas_role).toBe("company_admin");
  });

  it("the employment relationship stays a separate, explicit membership (not ownership)", async () => {
    const rows = await rowsAs(
      U.empB,
      `select org_id, role, job_function from public.memberships where user_id = auth.uid() order by role`
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { org_id: ORG.A, role: "employee", job_function: "pos" },
        { org_id: ORG.B, role: "owner", job_function: "general" },
      ])
    );
    const [{ a, b }] = await rowsAs(
      U.empB,
      `select public.is_company_admin_for_org($1) as a, public.is_company_admin_for_org($2) as b`,
      [ORG.A, ORG.B]
    );
    expect({ a, b }).toEqual({ a: false, b: true });
  });

  it("a cashier at Company A is NOT treated as a cashier in their own Business B", async () => {
    const [r] = await rowsAs(
      U.empB,
      `select public.is_pos_only_staff_for_org($1) as at_a, public.is_pos_only_staff_for_org($2) as at_b,
              public.is_pos_only_staff() as global`,
      [ORG.A, ORG.B]
    );
    expect(r).toEqual({ at_a: true, at_b: false, global: false });
  });
});

describe("dashboard data isolation (the reported leak)", () => {
  it("Employee B cannot read Company A revenue: payments, POS takings, invoices, quotes", async () => {
    expect(await sumAs(U.empB, "payments", ORG.A)).toBe(0);
    const pos = await rowsAs(U.empB, `select total_amount from public.pos_sales_events where org_id = $1`, [ORG.A]);
    expect(pos.map((r) => Number(r.total_amount))).toEqual([30]); // only their own till sale
    expect(await rowsAs(U.empB, `select id from public.invoices where org_id = $1`, [ORG.A])).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.quotes where org_id = $1`, [ORG.A])).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.invoice_items where invoice_id = $1`, [ROW.invA])).toEqual([]);
  });

  it("Employee B cannot read Company A expenses, clients (beyond till customers), banking, billing", async () => {
    expect(await sumAs(U.empB, "expenses", ORG.A)).toBe(0);
    const clients = await rowsAs(U.empB, `select name from public.clients where org_id = $1`, [ORG.A]);
    expect(clients.map((c) => c.name)).toEqual(["Walk-in"]);
    expect(await rowsAs(U.empB, `select id from public.banking_details where org_id = $1`, [ORG.A])).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.payment_history where company_id = $1`, [ORG.A])).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.pos_connections where org_id = $1`, [ORG.A])).toEqual([]);
  });

  it("an unfiltered dashboard query (RLS only) returns ONLY Business B data for Employee B", async () => {
    const pays = await rowsAs(U.empB, `select org_id, amount from public.payments`);
    expect(pays.map((p) => [p.org_id, Number(p.amount)])).toEqual([[ORG.B, 555]]);
    const inv = await rowsAs(U.empB, `select invoice_number from public.invoices order by 1`);
    expect(inv.map((i) => i.invoice_number)).toEqual(["B-INV-1"]);
    const exp = await rowsAs(U.empB, `select org_id from public.expenses`);
    expect(exp.map((e) => e.org_id)).toEqual([ORG.B]);
  });

  it("a general employee sees only the invoices/payments they own, never company totals", async () => {
    expect(await sumAs(U.empC, "payments", ORG.A)).toBe(200);
    const inv = await rowsAs(U.empC, `select invoice_number from public.invoices where org_id = $1`, [ORG.A]);
    expect(inv.map((i) => i.invoice_number)).toEqual(["A-INV-2"]);
    expect(await rowsAs(U.empC, `select id from public.quotes where org_id = $1`, [ORG.A])).toEqual([]);
    expect(await sumAs(U.empC, "expenses", ORG.A)).toBe(0);
    expect(await rowsAs(U.empC, `select id from public.pos_sales_events where org_id = $1`, [ORG.A])).toEqual([]);
    const items = await rowsAs(U.empC, `select invoice_id from public.invoice_items`);
    expect(items.map((i) => i.invoice_id)).toEqual([ROW.invC]);
    expect(await rowsAs(U.empC, `select id from public.payment_history`)).toEqual([]);
    const [{ ok }] = await rowsAs(U.empC, `select public.can_view_org_financials($1) as ok`, [ORG.A]);
    expect(ok).toBe(false);
  });

  it("owner and managers of Company A still see full Company A financials", async () => {
    expect(await sumAs(U.ownerA, "payments", ORG.A)).toBe(1200);
    expect(await sumAs(U.managerA, "payments", ORG.A)).toBe(1200);
    expect(await sumAs(U.ownerA, "expenses", ORG.A)).toBe(50);
    expect(await rowsAs(U.ownerA, `select id from public.quotes where org_id = $1`, [ORG.A])).toHaveLength(1);
    const pos = await rowsAs(U.managerA, `select total_amount from public.pos_sales_events where org_id = $1`, [ORG.A]);
    expect(pos).toHaveLength(2);
    expect(await rowsAs(U.ownerA, `select id from public.payment_history where company_id = $1`, [ORG.A])).toHaveLength(1);
    expect(await rowsAs(U.ownerA, `select webhook_secret from public.pos_connections`)).toEqual([
      { webhook_secret: "SECRET-A" },
    ]);
  });

  it("Company A never sees Business B private data (and vice versa for Company Z)", async () => {
    for (const user of [U.ownerA, U.managerA, U.financeA, U.empC]) {
      expect(await sumAs(user, "payments", ORG.B)).toBe(0);
      expect(await rowsAs(user, `select id from public.invoices where org_id = $1`, [ORG.B])).toEqual([]);
      expect(await rowsAs(user, `select id from public.quotes where org_id = $1`, [ORG.B])).toEqual([]);
      expect(await sumAs(user, "expenses", ORG.B)).toBe(0);
    }
    expect(await sumAs(U.ownerZ, "payments", ORG.A)).toBe(0);
    expect(await sumAs(U.ownerA, "payments", ORG.Z)).toBe(0);
  });
});

describe("Employee B's own business is fully usable despite being a cashier elsewhere", () => {
  it("reads all Business B financial rows", async () => {
    expect(await sumAs(U.empB, "payments", ORG.B)).toBe(555);
    expect(await sumAs(U.empB, "expenses", ORG.B)).toBe(11);
    expect(await rowsAs(U.empB, `select id from public.quotes where org_id = $1`, [ORG.B])).toHaveLength(1);
  });

  it("writes Business B rows (invoice, client, expense) — not blocked by the Company A POS role", async () => {
    const inv = await as(
      U.empB,
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, 'B-INV-2', 'draft', 10, auth.uid(), auth.uid()) returning id`,
      [ORG.B]
    );
    expect(inv.ok).toBe(true);
    const cl = await as(
      U.empB,
      `insert into public.clients (org_id, name, created_by_id) values ($1, 'B client', auth.uid()) returning notes`,
      [ORG.B]
    );
    expect(cl.ok).toBe(true);
    const upd = await as(U.empB, `update public.clients set notes = 'kept' where org_id = $1 returning notes`, [ORG.B]);
    expect(upd.rows).toEqual([{ notes: "kept" }]); // POS scrub trigger does not fire in Business B
    const ex = await as(U.empB, `insert into public.expenses (org_id, amount, created_by_id) values ($1, 5, auth.uid())`, [
      ORG.B,
    ]);
    expect(ex.ok).toBe(true);
  });

  it("converts a Business B quote (global POS check no longer blocks the owner)", async () => {
    const r = await as(U.empB, `select public.convert_quote_to_invoice($1, '{}'::jsonb) as res`, [ROW.quoteB]);
    expect(r.ok, r.message).toBe(true);
  });

  it("administers Business B payroll", async () => {
    const [r] = await rowsAs(U.empB, `select public.can_manage_org_payroll($1) as b, public.can_manage_org_payroll($2) as a`, [
      ORG.B,
      ORG.A,
    ]);
    expect(r).toEqual({ b: true, a: false });
  });
});

describe("payroll & payslips", () => {
  it("employee reads own payslip, not a colleague's, not by changing ids", async () => {
    const own = await rowsAs(U.empC, `select id from public.payslips where org_id = $1`, [ORG.A]);
    expect(own.map((r) => r.id)).toEqual([ROW.slipC]);
    expect(await rowsAs(U.empC, `select id from public.payslips where id = $1`, [ROW.slipB])).toEqual([]);
  });

  it("changing profiles.email to a colleague's email does NOT expose their payslip", async () => {
    const upd = await as(U.empC, `update public.profiles set email = 'employee@example.com' where id = auth.uid()`);
    expect(upd.ok).toBe(true);
    expect(await rowsAs(U.empC, `select id from public.payslips where id = $1`, [ROW.slipB])).toEqual([]);
    await q(`update public.profiles set email = 'sales@company-a.test' where id = $1`, [U.empC]);
  });

  it("a non-payroll manager cannot read or edit every employee's payslip", async () => {
    expect(await rowsAs(U.managerA, `select id from public.payslips where org_id = $1`, [ORG.A])).toEqual([]);
    const upd = await as(U.managerA, `update public.payslips set net_pay = 1 where id = $1 returning id`, [ROW.slipC]);
    expect(upd.rows ?? []).toEqual([]);
    const ins = await as(
      U.managerA,
      `insert into public.payslips (org_id, membership_id, employee_name, net_pay) values ($1, $2, 'x', 1)`,
      [ORG.A, ROW.memC_A]
    );
    expect(ins.ok).toBe(false);
  });

  it("finance manager and owner read the company payroll", async () => {
    for (const user of [U.financeA, U.ownerA]) {
      expect(await rowsAs(user, `select id from public.payslips where org_id = $1`, [ORG.A])).toHaveLength(2);
    }
  });

  it("employees cannot read pay runs or payroll configuration", async () => {
    for (const user of [U.empB, U.empC]) {
      const [r] = await rowsAs(user, `select public.can_manage_org_payroll($1) as m`, [ORG.A]);
      expect(r.m).toBe(false);
      expect(await rowsAs(user, `select id from public.pay_runs where org_id = $1`, [ORG.A])).toEqual([]);
      expect(await rowsAs(user, `select id from public.payroll_component_types where org_id = $1`, [ORG.A])).toEqual([]);
    }
  });

  it("a cashier keeps the existing rule: no payroll data through the portal of that company", async () => {
    // Existing product rule (is_pos_only_staff scoping) — the payslip row id owned by the membership stays hidden;
    // employee_user_id still resolves their own slip only.
    const rows = await rowsAs(U.empB, `select id from public.payslips where org_id = $1`, [ORG.A]);
    expect(rows.every((r) => r.id === ROW.slipB)).toBe(true);
    expect(await rowsAs(U.empB, `select id from public.payslips where id = $1`, [ROW.slipC])).toEqual([]);
  });
});

describe("POS", () => {
  it("cashier keeps till access: POS permissions + till customers in Company A", async () => {
    const [r] = await rowsAs(
      U.empB,
      `select public.org_has_pos_permission($1, 'pos_sell') as sell, public.org_has_pos_permission($1, 'pos_view_reports') as reports,
              public.org_has_pos_permission($2, 'pos_sell') as other`,
      [ORG.A, ORG.Z]
    );
    expect(r).toEqual({ sell: true, reports: false, other: false });
    const ins = await as(
      U.empB,
      `insert into public.clients (org_id, name, pos_enabled, notes) values ($1, 'Till customer', true, 'secret') returning notes, created_by_id`,
      [ORG.A]
    );
    expect(ins.ok, ins.message).toBe(true);
    expect(ins.rows[0]).toEqual({ notes: null, created_by_id: U.empB }); // scrub trigger still applies at Company A
  });

  it("cashier cannot write Company A back-office rows or another company's POS", async () => {
    const inv = await as(
      U.empB,
      `insert into public.invoices (org_id, invoice_number, total_amount, user_id, created_by)
       values ($1, 'hack', 1, auth.uid(), auth.uid())`,
      [ORG.A]
    );
    expect(inv.ok).toBe(false);
    const bank = await as(U.empB, `update public.banking_details set account_number = '999' where org_id = $1 returning id`, [
      ORG.A,
    ]);
    expect(bank.rows ?? []).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.pos_sales_events where org_id = $1`, [ORG.Z])).toEqual([]);
    expect(await rowsAs(U.empB, `select id from public.pos_registers where org_id = $1`, [ORG.Z])).toEqual([]);
  });
});

describe("cross-tenant ID manipulation", () => {
  it("reading another tenant's rows by id returns nothing", async () => {
    for (const [sql, id] of [
      [`select id from public.invoices where id = $1`, ROW.invA],
      [`select id from public.quotes where id = $1`, ROW.quoteA],
      [`select id from public.clients where id = $1`, ROW.clientA],
      [`select id from public.payslips where id = $1`, ROW.slipC],
      [`select id from public.memberships where id = $1`, ROW.memC_A],
    ]) {
      expect(await rowsAs(U.ownerZ, sql, [id]), sql).toEqual([]);
    }
    expect(await rowsAs(U.empB, `select id from public.invoices where id = $1`, [ROW.invA])).toEqual([]);
    expect(await rowsAs(U.ownerA, `select id from public.invoices where id = $1`, [ROW.invZ])).toEqual([]);
    expect(await rowsAs(U.ownerA, `select id from public.invoices where id = $1`, [ROW.invB])).toEqual([]);
    expect(await rowsAs(U.ownerZ, `select id from public.invoices where id = $1`, [ROW.invZ])).toHaveLength(1);
  });

  it("moving own rows into another company (org_id rewrite) is rejected", async () => {
    const r = await as(U.empC, `update public.invoices set org_id = $1 where id = $2`, [ORG.Z, ROW.invC]);
    expect(r.ok).toBe(false);
    const own = await one(`select org_id from public.invoices where id = $1`, [ROW.invC]);
    expect(own.org_id).toBe(ORG.A);
  });

  it("inserting into a company you are not a member of is rejected", async () => {
    for (const [table, cols] of [
      ["invoices", `(org_id, invoice_number, total_amount, user_id, created_by) values ($1, 'x', 1, auth.uid(), auth.uid())`],
      ["clients", `(org_id, name, created_by_id) values ($1, 'x', auth.uid())`],
      ["expenses", `(org_id, amount, created_by_id) values ($1, 1, auth.uid())`],
    ]) {
      const r = await as(U.empB, `insert into public.${table} ${cols}`, [ORG.Z]);
      expect(r.ok, table).toBe(false);
    }
  });

  it("editing a colleague's invoice / line items by id is rejected", async () => {
    const r = await as(U.empC, `update public.invoices set total_amount = 1 where id = $1 returning id`, [ROW.invA]);
    expect(r.rows ?? []).toEqual([]);
    const items = await as(
      U.empC,
      `insert into public.invoice_items (invoice_id, service_name, quantity, unit_price, total_price) values ($1, 'x', 1, 1, 1)`,
      [ROW.invA]
    );
    expect(items.ok).toBe(false);
    const del = await as(U.empC, `delete from public.invoice_items where invoice_id = $1 returning id`, [ROW.invA]);
    expect(del.rows ?? []).toEqual([]);
  });

  it("a bare DELETE by an employee cannot wipe company tables", async () => {
    for (const table of ["recurring_invoices", "expenses", "banking_details", "companies", "suppliers", "purchase_orders"]) {
      const r = await as(U.empC, `delete from public.${table} where org_id = $1`, [ORG.A]);
      expect(r.ok, `${table}: ${r.message}`).toBe(true);
      expect(r.affectedRows ?? 0, table).toBe(0);
    }
    expect(await one(`select count(*)::int as n from public.banking_details where org_id = $1`, [ORG.A])).toEqual({ n: 1 });
  });

  it("self-escalation via profiles.role or membership insert is rejected", async () => {
    await as(U.empC, `update public.profiles set role = 'admin' where id = auth.uid()`);
    const [{ admin }] = await rowsAs(U.empC, `select public.is_platform_admin() as admin`);
    expect(admin).toBe(false);
    const mem = await as(U.empC, `insert into public.memberships (org_id, user_id, role) values ($1, auth.uid(), 'owner')`, [
      ORG.Z,
    ]);
    expect(mem.ok).toBe(false);
    const promote = await as(U.empC, `update public.memberships set role = 'admin' where id = $1 returning id`, [
      ROW.memC_A,
    ]);
    expect(promote.rows ?? []).toEqual([]);
  });

  it("the trigger helper touch_client_last_activity is not a client RPC", async () => {
    const r = await as(U.ownerZ, `select public.touch_client_last_activity($1, now())`, [ROW.clientA]);
    expect(r).toMatchObject({ ok: false, code: "42501" });
  });

  it("anonymous callers see nothing", async () => {
    for (const table of ["invoices", "payments", "payslips", "clients", "expenses", "pos_sales_events"]) {
      const r = await as(null, `select count(*)::int as n from public.${table}`);
      expect(r.ok ? r.rows[0].n : 0, table).toBe(0);
    }
  });
});

describe("RLS coverage", () => {
  it("every public table has RLS enabled (except the server-only rate limiter, which grants nothing)", async () => {
    const off = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`
    );
    expect(off.map((r) => r.relname)).toEqual(["api_rate_limit_buckets"]);
  });

  it("no remaining policy on a financial table is a bare 'is a member of the org' check", async () => {
    const financial = [
      "invoices", "quotes", "invoice_items", "quote_items", "payments", "expenses", "clients", "payslips",
      "payment_intents", "payment_refunds", "pos_sales_events", "pos_register_sessions", "banking_details",
      "purchase_orders", "purchase_order_items", "suppliers", "recurring_invoices", "message_logs", "document_sends",
      "invoice_views", "payment_history", "subscription_invoices", "pos_connections",
    ];
    const rows = await q(
      `select tablename, policyname, cmd, coalesce(qual, '') as qual from pg_policies
       where schemaname = 'public' and tablename = any($1) and cmd <> 'INSERT'`,
      [financial]
    );
    const bare = rows.filter((p) => {
      const qual = p.qual.replace(/\s+/g, " ");
      const memberOnly =
        /^\(?EXISTS \( SELECT 1 FROM memberships m WHERE \(\(m\.org_id = \w+\.org_id\) AND \(m\.user_id = \( SELECT auth\.uid\(\) AS uid\)\)\)\)\)?$/.test(
          qual
        ) || /^is_org_member\(org_id\)$/.test(qual) || /org_id IN \( SELECT memberships\.org_id/.test(qual);
      return memberOnly;
    });
    expect(bare).toEqual([]);
  });
});
