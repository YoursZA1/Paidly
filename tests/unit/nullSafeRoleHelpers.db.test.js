/**
 * Role helpers never return NULL (20261009150000), on the REAL schema replayed on PGlite.
 *
 * A NULL from can_view_org_financials / can_read_org_financial_row is "no" inside RLS but slips through a
 * plpgsql `IF NOT helper(...) THEN RAISE`. Before the fix an employee could convert any quote in their
 * business, and an outsider passed the supplier-payment role guard.
 * `PAIDLY_REPLAY_BEFORE=20261009150000` reproduces the old behaviour. People are fictional.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params) => runAs(db, user, sql, params);

const U = {
  owner: "a5000000-0000-4000-8000-000000000001",
  manager: "a5000000-0000-4000-8000-000000000002",
  employee: "a5000000-0000-4000-8000-000000000003",
  disabled: "a5000000-0000-4000-8000-000000000004",
  outsider: "f5000000-0000-4000-8000-000000000001",
};
let ORG;
const QUOTE = {};

async function signUp(id, email, orgName) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ org_name: orgName, plan: "business" })]);
  return (await one(`select id from public.organizations where owner_id = $1`, [id])).id;
}

async function inviteInto(orgId, id, email, role) {
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), '{"pending_company_invite":"true"}')`, [id, email]);
  await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, 'general')`, [orgId, id, role]);
}

const quote = async (number, userId, createdBy) =>
  (await one(
    `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by)
     values ($1, $2, 'sent', 500, $3, $4) returning id`,
    [ORG, number, userId, createdBy]
  )).id;

const convert = (user, id) => as(user, `select public.convert_quote_to_invoice($1, '{}'::jsonb) as res`, [id]);

beforeAll(async () => {
  db = await replaySupabaseSchema();
  ORG = await signUp(U.owner, "owner@harbour.test", "Harbour Traders");
  await signUp(U.outsider, "owner@inland.test", "Inland Traders");
  await inviteInto(ORG, U.manager, "manager@harbour.test", "manager");
  await inviteInto(ORG, U.employee, "sales@harbour.test", "employee");
  await inviteInto(ORG, U.disabled, "former@harbour.test", "manager");
  await q(`update public.memberships set disabled_at = now() where user_id = $1`, [U.disabled]);
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     values ($1, 'owner@harbour.test', $2, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly',
       now() + interval '30 days')`,
    [U.owner, ORG]
  );
  QUOTE.owners = await quote("Q-OWNER", U.owner, U.owner);
  QUOTE.employees = await quote("Q-SALES", U.employee, U.employee);
  QUOTE.orphaned = await quote("Q-ORPHAN", null, null);
  QUOTE.orphaned2 = await quote("Q-ORPHAN-2", null, null);
}, 120_000);

describe("role helpers", () => {
  const HELPERS = `select public.can_view_org_financials($1) as fin, public.is_company_manager_for_org($1) as mgr,
    public.is_company_admin_for_org($1) as adm, public.can_read_org_financial_row($1, null, null, null) as row_any`;

  it.each([
    ["an outsider", "outsider", { fin: false, mgr: false, adm: false, row_any: false }],
    ["a disabled manager", "disabled", { fin: false, mgr: false, adm: false, row_any: false }],
    ["an active employee", "employee", { fin: false, mgr: false, adm: false, row_any: false }],
    ["a manager", "manager", { fin: true, mgr: true, adm: false, row_any: true }],
    ["the owner", "owner", { fin: true, mgr: true, adm: true, row_any: true }],
  ])("give a plain true/false for %s", async (_label, who, expected) => {
    const r = await as(U[who], HELPERS, [ORG]);
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0]).toEqual(expected);
  });
});

describe("convert_quote_to_invoice", () => {
  it("refuses an employee converting the owner's quote", async () => {
    const r = await convert(U.employee, QUOTE.owners);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("42501");
  });

  it("refuses an employee converting a quote whose creator was deleted", async () => {
    const r = await convert(U.employee, QUOTE.orphaned);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("42501");
  });

  it("still lets an employee convert their own quote", async () => {
    const r = await convert(U.employee, QUOTE.employees);
    expect(r.ok, r.message).toBe(true);
  });

  it("still lets a manager convert a quote whose creator was deleted", async () => {
    const r = await convert(U.manager, QUOTE.orphaned2);
    expect(r.ok, r.message).toBe(true);
  });

  it("refuses an outsider and a disabled manager", async () => {
    for (const who of ["outsider", "disabled"]) {
      const r = await convert(U[who], QUOTE.owners);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("42501");
    }
  });
});

describe("supplier payment guard", () => {
  it("stops an outsider at the role check, not later", async () => {
    const r = await as(
      U.outsider,
      `insert into public.expenses (org_id, amount, category, created_by_id, purchase_order_id)
       values ($1, 10, 'other', $2, gen_random_uuid()) returning id`,
      [ORG, U.outsider]
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("42501");
    expect(r.message).toMatch(/Only owners and managers can record supplier payments/);
  });
});
