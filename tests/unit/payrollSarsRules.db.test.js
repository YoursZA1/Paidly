/**
 * 20260925140000_payroll_sars_tax_years_and_ytd.sql on real Postgres (PGlite), on top of the legacy
 * seed and the append-only trigger it has to work with:
 *   - applies twice (idempotent) without editing any rule value in place
 *   - the 2000-01-01 PAYE window is closed; 2025/26 and 2026/27 versions exist
 *   - what payroll selects for September 2026 gives PAYE R675.00 on R12 000
 *   - finalized (locked) payslips cannot have YTD / employer contributions rewritten
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { calculatePayroll, selectStatutoryRules } from "@shared/payroll/calculatePayroll.js";

const MIG = (f) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIGRATION = MIG("20260925140000_payroll_sars_tax_years_and_ytd.sql");

// Tables as the earlier payroll migrations leave them (only the columns this migration touches).
const STUB = `
create table public.payroll_statutory_rules (
  id uuid primary key default gen_random_uuid(), org_id uuid, code text not null, name text not null,
  effective_from date not null, effective_to date, calculation_type text not null,
  value jsonb not null default '{}'::jsonb, employee_portion boolean not null default true,
  employer_portion boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.payroll_profiles (id uuid primary key default gen_random_uuid());
create table public.pay_run_items (id uuid primary key default gen_random_uuid());
create table public.payslips (id uuid primary key default gen_random_uuid(), locked boolean default false, net_pay numeric);
`;

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  // Legacy seed section of 20260902120000 (the INSERT … WHERE NOT EXISTS block).
  const legacy = MIG("20260902120000_payroll_engine_and_leave_ledger.sql");
  const seed = legacy.slice(legacy.indexOf("INSERT INTO public.payroll_statutory_rules"), legacy.indexOf("-- ── Pay runs"));
  await db.exec(seed);
  // Append-only trigger + unique windows (20260915130000).
  await db.exec(MIG("20260915130000_payroll_statutory_append_only.sql"));
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent
}, 60_000);

describe("statutory rule versions", () => {
  it("closes the legacy windows and adds dated SARS versions (no duplicates on re-run)", async () => {
    const rows = await q(
      `select code, effective_from::text as "from", effective_to::text as "to", value->>'tax_year' as ty
       from payroll_statutory_rules where org_id is null order by code, effective_from`
    );
    expect(rows).toEqual([
      { code: "PAYE", from: "2000-01-01", to: "2025-02-28", ty: null },
      { code: "PAYE", from: "2025-03-01", to: "2026-02-28", ty: "2026" },
      { code: "PAYE", from: "2026-03-01", to: "2027-02-28", ty: "2027" },
      { code: "SDL", from: "2000-01-01", to: "2026-02-28", ty: null },
      { code: "SDL", from: "2026-03-01", to: null, ty: null },
      { code: "UIF", from: "2000-01-01", to: "2026-02-28", ty: null },
      { code: "UIF", from: "2026-03-01", to: null, ty: null },
      { code: "UIF_EMPLOYER", from: "2000-01-01", to: "2026-02-28", ty: null },
      { code: "UIF_EMPLOYER", from: "2026-03-01", to: null, ty: null },
    ]);
  });

  it("the legacy row's values were not edited (append-only)", async () => {
    const [legacy] = await q(`select value from payroll_statutory_rules where code = 'PAYE' and effective_from = '2000-01-01'`);
    expect(legacy.value.rebate).toBe(17235);
    await expect(db.exec(`update payroll_statutory_rules set value = '{}' where code = 'PAYE' and effective_from = '2000-01-01'`)).rejects.toThrow(/append-only/);
  });

  it("rules selected from the database for September 2026 give PAYE R675.00 on R12 000", async () => {
    // PostgREST returns date columns as "YYYY-MM-DD" strings (PGlite would give Date objects).
    const rules = await q(
      `select id, org_id, code, name, calculation_type, value, employee_portion, employer_portion,
              effective_from::text as effective_from, effective_to::text as effective_to
       from payroll_statutory_rules`
    );
    const selected = selectStatutoryRules(rules, "2026-09-30");
    const r = calculatePayroll({ profile: { base_salary: 12000 }, statutoryRules: selected, context: { payDate: "2026-09-30" } });
    expect(r.tax_deduction).toBe(675);
    expect(r.uif_deduction).toBe(120);
    expect(r.net_pay).toBe(11205);
  });
});

describe("columns and locks", () => {
  it("adds the profile / item / payslip columns", async () => {
    const cols = await q(
      `select table_name, column_name from information_schema.columns
       where column_name in ('medical_scheme_members','ordinary_hours','days_worked','tax_year','ytd','employer_contributions')
       order by table_name, column_name`
    );
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      "pay_run_items.days_worked",
      "pay_run_items.ordinary_hours",
      "payroll_profiles.medical_scheme_members",
      "payslips.employer_contributions",
      "payslips.tax_year",
      "payslips.ytd",
    ]);
  });

  it("a locked payslip's YTD, tax year and employer contributions are frozen; drafts stay editable", async () => {
    const [locked] = await q(`insert into payslips (locked, ytd, tax_year) values (true, '{"paye":675}', '2026/27') returning id`);
    await expect(db.exec(`update payslips set ytd = '{"paye":1}' where id = '${locked.id}'`)).rejects.toThrow(/cannot have their YTD/);
    await expect(db.exec(`update payslips set tax_year = '2027/28' where id = '${locked.id}'`)).rejects.toThrow(/cannot have their YTD/);
    const [draft] = await q(`insert into payslips (locked, ytd) values (false, '{}') returning id`);
    await db.exec(`update payslips set ytd = '{"paye":2}' where id = '${draft.id}'`);
    expect((await q(`select ytd from payslips where id = $1`, [draft.id]))[0].ytd).toEqual({ paye: 2 });
  });

  it("medical_scheme_members rejects impossible values", async () => {
    await expect(db.exec(`insert into payroll_profiles (medical_scheme_members) values (-1)`)).rejects.toThrow();
    await db.exec(`insert into payroll_profiles (medical_scheme_members) values (3)`);
  });
});

describe("TEST 18 / 19 — finalized payroll is immutable; corrections are adjustment runs", () => {
  let pg;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      create table public.pay_runs (id uuid primary key default gen_random_uuid(), org_id uuid, status text,
        period_start date, period_end date, gross_total numeric, deductions_total numeric, net_total numeric,
        employee_count int, finalized_at timestamptz, run_type text default 'regular', original_pay_run_id uuid);
      create table public.pay_run_items (id uuid primary key default gen_random_uuid(), pay_run_id uuid, gross_pay numeric,
        net_pay numeric, base_pay numeric, earnings jsonb, taxable_income numeric, statutory_deductions jsonb,
        other_deductions jsonb, total_deductions numeric, employee_name text, employee_number text, calculation jsonb);
    `);
    // The lock function as this migration leaves it (20260919120000's, DELETE fix applied), attached
    // the way 20260902120000 / 20260919120000 do.
    const fn = MIGRATION.slice(MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_mutation"));
    await pg.exec(fn);
    await pg.exec(`
      create trigger pay_runs_lock before update on public.pay_runs for each row execute function public.prevent_locked_payroll_mutation();
      create trigger pay_run_items_lock before update on public.pay_run_items for each row execute function public.prevent_locked_payroll_mutation();
      create trigger pay_runs_lock_delete before delete on public.pay_runs for each row execute function public.prevent_locked_payroll_mutation();
      create trigger pay_run_items_lock_delete before delete on public.pay_run_items for each row execute function public.prevent_locked_payroll_mutation();
    `);
  }, 60_000);

  it("a finalized run's totals and items cannot be rewritten or deleted; the adjustment run is new data", async () => {
    const [runRow] = (
      await pg.query(`insert into pay_runs (status, period_start, period_end, net_total, finalized_at)
                      values ('approved', '2026-09-01', '2026-09-30', 11156.25, now()) returning id`)
    ).rows;
    const [itemRow] = (
      await pg.query(`insert into pay_run_items (pay_run_id, gross_pay, net_pay, calculation)
                      values ($1, 12000, 11156.25, '{"paye":{"paye":723.75}}') returning id`, [runRow.id])
    ).rows;

    // The historical payslip data cannot be "fixed" in place…
    await expect(pg.exec(`update pay_run_items set net_pay = 11205 where id = '${itemRow.id}'`)).rejects.toThrow(/cannot be rewritten/);
    await expect(pg.exec(`update pay_run_items set calculation = '{}' where id = '${itemRow.id}'`)).rejects.toThrow(/cannot be rewritten/);
    await expect(pg.exec(`update pay_runs set net_total = 11205 where id = '${runRow.id}'`)).rejects.toThrow(/adjustment run/);
    await expect(pg.exec(`delete from pay_run_items where id = '${itemRow.id}'`)).rejects.toThrow(/cannot be deleted/);
    await expect(pg.exec(`delete from pay_runs where id = '${runRow.id}'`)).rejects.toThrow(/adjustment run/);

    // Draft items can be deleted (before the fix this failed: record "old" has no field "finalized_at").
    const [draftRun] = (await pg.query(`insert into pay_runs (status) values ('draft') returning id`)).rows;
    const [draftItem] = (await pg.query(`insert into pay_run_items (pay_run_id) values ($1) returning id`, [draftRun.id])).rows;
    await pg.exec(`delete from pay_run_items where id = '${draftItem.id}'`);

    // …the correction (R48.75 PAYE refund from the new rebate) is a separate adjustment run.
    const [adj] = (
      await pg.query(`insert into pay_runs (status, period_start, period_end, run_type, original_pay_run_id, net_total)
                      values ('draft', '2026-09-01', '2026-09-30', 'adjustment', $1, 48.75) returning id`, [runRow.id])
    ).rows;
    await pg.exec(`update pay_runs set net_total = 50 where id = '${adj.id}'`); // drafts stay editable
    const original = (await pg.query(`select net_pay::float from pay_run_items where id = $1`, [itemRow.id])).rows[0];
    expect(original.net_pay).toBe(11156.25);
  });
});
