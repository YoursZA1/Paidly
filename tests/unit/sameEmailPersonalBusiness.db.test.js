/**
 * Same email, two independent contexts — on the REAL schema (every migration replayed on PGlite),
 * queried as the signed-in user through RLS with the exact column lists the SPA list pages send.
 *
 *   employee@example.com
 *     ├─ employment membership → Padosio (employee)            → /employee/padosio
 *     └─ business membership   → "My Personal Business" (owner) → normal Paidly
 *
 * A brand-new personal business with ZERO records must answer every list query successfully with []
 * (never an error) — the empty state, not "Could not load …". Employer data must never be returned.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";
import { getSelectColumns } from "@/api/entity/entityShared.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const OWNER = "f1000000-0000-4000-8000-000000000001"; // Padosio owner
const EMP = "f1000000-0000-4000-8000-000000000002"; // employee@example.com
const COLLEAGUE = "f1000000-0000-4000-8000-000000000003";
const ORG = {};
const ROW = {};

/** PostgREST-equivalent SELECT of `columns` from `table` for one org, as `user`. */
const list = (user, table, columns, orgId) =>
  runAs(db, user, `select ${columns} from public.${table} where org_id = $1 order by created_at desc limit 40`, [orgId]);

/** The page queries (EntityManager list pages + Documents hub + services catalog). */
const PAGES = {
  clients: () => getSelectColumns("clients"),
  quotes: () => getSelectColumns("quotes"),
  invoices: () => getSelectColumns("invoices"),
  services: () => getSelectColumns("services"), // Products / catalog
  expenses: () => getSelectColumns("expenses"),
  documents: () =>
    "id, org_id, type, category_key, status, document_number, title, total_amount, currency, base_currency, exchange_rate, client_id, assigned_user_id, archived_at, created_at, updated_at",
};

beforeAll(async () => {
  db = await replaySupabaseSchema();
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@padosio.test', '{"org_name":"Padosio"}')`, [OWNER]);
  ORG.padosio = (await one(`select id from public.organizations where owner_id = $1`, [OWNER])).id;

  for (const [id, email] of [[EMP, "employee@example.com"], [COLLEAGUE, "colleague@padosio.test"]]) {
    await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), '{"pending_company_invite":"true"}')`, [id, email]);
  }
  ROW.empMembership = (await one(
    `insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, 'employee', 'pos') returning id`,
    [ORG.padosio, EMP]
  )).id;
  ROW.colleagueMembership = (await one(
    `insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, 'employee', 'general') returning id`,
    [ORG.padosio, COLLEAGUE]
  )).id;

  // Padosio business data
  ROW.client = (await one(`insert into public.clients (org_id, name, created_by_id) values ($1, 'Padosio VIP', $2) returning id`, [ORG.padosio, OWNER])).id;
  ROW.invoice = (await one(
    `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by) values ($1, 'P-1', 'paid', 5000, $2, $2) returning id`,
    [ORG.padosio, OWNER]
  )).id;
  ROW.quote = (await one(
    `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by) values ($1, 'PQ-1', 'sent', 700, $2, $2) returning id`,
    [ORG.padosio, OWNER]
  )).id;
  ROW.product = (await one(
    `insert into public.services (org_id, name, default_unit, item_type, created_by_id) values ($1, 'Pizza', 'unit', 'product', $2) returning id`,
    [ORG.padosio, OWNER]
  )).id;
  ROW.document = (await one(
    `insert into public.documents (org_id, type, status, title, created_by, user_id) values ($1, 'purchase_order', 'draft', 'Supplier PO', $2, $2) returning id`,
    [ORG.padosio, OWNER]
  )).id;
  await q(`insert into public.expenses (org_id, amount, created_by_id) values ($1, 99, $2)`, [ORG.padosio, OWNER]);
  ROW.empSlip = (await one(
    `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, net_pay) values ($1, $2, $3, 'Employee', 8000) returning id`,
    [ORG.padosio, ROW.empMembership, EMP]
  )).id;
  ROW.colleagueSlip = (await one(
    `insert into public.payslips (org_id, membership_id, employee_user_id, employee_name, net_pay) values ($1, $2, $3, 'Colleague', 9000) returning id`,
    [ORG.padosio, ROW.colleagueMembership, COLLEAGUE]
  )).id;

  // Later: the same person creates their own business (server bootstrap = org + owner membership).
  ORG.personal = (await one(
    `insert into public.organizations (name, owner_id) values ('My Personal Business', $1) returning id`,
    [EMP]
  )).id;
  await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, 'owner', 'general')`, [ORG.personal, EMP]);
}, 180_000);

describe("personal business with zero records: every list query succeeds with [] (empty state, not an error)", () => {
  for (const [page, columns] of Object.entries(PAGES)) {
    it(`${page}`, async () => {
      const r = await list(EMP, page === "services" ? "services" : page, columns(), ORG.personal);
      expect(r.ok, `${page}: ${r.message}`).toBe(true);
      expect(r.rows).toEqual([]);
    });
  }

  it("populated personal business renders its own rows", async () => {
    await q(`insert into public.clients (org_id, name, created_by_id) values ($1, 'My client', $2)`, [ORG.personal, EMP]);
    const r = await list(EMP, "clients", getSelectColumns("clients"), ORG.personal);
    expect(r.ok, r.message).toBe(true);
    expect(r.rows.map((c) => c.name)).toEqual(["My client"]);
  });
});

describe("same email never merges contexts", () => {
  it("the employer's business data is not returned to the employee, by org or by id", async () => {
    for (const [page, columns] of Object.entries(PAGES)) {
      const r = await list(EMP, page, columns(), ORG.padosio);
      expect(r.ok, `${page}: ${r.message}`).toBe(true);
      expect(r.rows, page).toEqual([]);
    }
    for (const [table, id] of [
      ["clients", ROW.client], ["invoices", ROW.invoice], ["quotes", ROW.quote],
      ["services", ROW.product], ["documents", ROW.document],
    ]) {
      const r = await runAs(db, EMP, `select id from public.${table} where id = $1`, [id]);
      expect(r.rows, table).toEqual([]);
    }
  });

  it("an unfiltered read never mixes the two businesses", async () => {
    const r = await runAs(db, EMP, `select org_id from public.clients`);
    expect([...new Set(r.rows.map((x) => x.org_id))]).toEqual([ORG.personal]);
  });

  it("employee context: own payslip only; never a colleague's (even by id)", async () => {
    const own = await runAs(db, EMP, `select id from public.payslips where org_id = $1`, [ORG.padosio]);
    expect(own.rows.map((r) => r.id)).toEqual([ROW.empSlip]);
    const other = await runAs(db, EMP, `select id from public.payslips where id = $1`, [ROW.colleagueSlip]);
    expect(other.rows).toEqual([]);
  });

  it("Padosio's owner never sees the personal business", async () => {
    for (const table of ["clients", "invoices", "quotes", "services", "documents", "expenses"]) {
      const r = await runAs(db, OWNER, `select id from public.${table} where org_id = $1`, [ORG.personal]);
      expect(r.rows, table).toEqual([]);
    }
  });

  it("a same-business update still works; moving the row into the employer is refused", async () => {
    const created = await one(
      `insert into public.clients (org_id, name, created_by_id) values ($1, 'Rename me', $2) returning id`,
      [ORG.personal, EMP]
    );
    const kept = await runAs(
      db,
      EMP,
      `update public.clients set name = 'Renamed', org_id = $2 where id = $1 returning name, org_id`,
      [created.id, ORG.personal]
    );
    expect(kept.ok, kept.message).toBe(true);
    expect(kept.rows).toEqual([{ name: "Renamed", org_id: ORG.personal }]);

    const moved = await runAs(
      db,
      EMP,
      `update public.clients set org_id = $2 where id = $1 returning id`,
      [created.id, ORG.padosio]
    );
    expect(moved.ok).toBe(false);
  });

  it("cashier at the employer keeps POS sell there, and is not locked out of the personal business", async () => {
    const r = await runAs(
      db,
      EMP,
      `select public.is_pos_only_staff_for_org($1) as employer,
              public.is_pos_only_staff_for_org($2) as personal,
              public.org_has_pos_permission($1, 'pos_sell') as can_sell`,
      [ORG.padosio, ORG.personal]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0]).toEqual({ employer: true, personal: false, can_sell: true });
  });

  it("a revoked employee loses the employer, including their own payslip, and keeps the personal business", async () => {
    await q(`update public.memberships set portal_revoked_at = now() where id = $1`, [ROW.empMembership]);
    try {
      const clients = await runAs(db, EMP, `select id from public.clients where org_id = $1`, [ORG.padosio]);
      expect(clients.rows).toEqual([]);
      const slip = await runAs(db, EMP, `select id from public.payslips where id = $1`, [ROW.empSlip]);
      expect(slip.rows).toEqual([]);
      const own = await runAs(db, EMP, `select id from public.organizations where owner_id = auth.uid()`);
      expect(own.rows.map((row) => row.id)).toEqual([ORG.personal]);
    } finally {
      await q(`update public.memberships set portal_revoked_at = null where id = $1`, [ROW.empMembership]);
    }
  });

  it("ID manipulation: writing into the employer's business with its ids is refused", async () => {
    const ins = await runAs(db, EMP, `insert into public.clients (org_id, name, created_by_id) values ($1, 'x', auth.uid())`, [ORG.padosio]);
    expect(ins.ok).toBe(false); // cashier at Padosio: no back-office writes
    for (const [table, id] of [["clients", ROW.client], ["invoices", ROW.invoice], ["quotes", ROW.quote], ["services", ROW.product]]) {
      const upd = await runAs(db, EMP, `update public.${table} set updated_at = now() where id = $1 returning id`, [id]);
      expect(upd.rows ?? [], table).toEqual([]);
    }
    const mv = await runAs(db, EMP, `update public.clients set org_id = $1 where org_id = $2 returning id`, [ORG.padosio, ORG.personal]);
    expect(mv.ok).toBe(false);
  });
});
