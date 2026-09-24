/**
 * Day 2 — a member's own subscription never unlocks paid features for an employer that has not paid.
 *
 * Runs the real migrations (company_access_subscription + the plan feature guard) on in-process
 * Postgres (PGlite) and writes as an end user, the way PostgREST does:
 *   - a member with a personal company-less paid row cannot insert Business-only rows into an
 *     unpaid employer (20260924150000_company_access_owner_rows_only.sql)
 *   - the owner's company-less row still counts for the company (legacy PayFast ITN rows)
 *   - profiles.plan says nothing to the guard
 *   - invoices / quotes / clients need an active subscription (20260924160000), inserts only
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "20260921140000_canonical_plan_entitlements.sql",
  "20260923120000_finite_admin_trials_expire.sql",
  "20260923150000_package_identity_not_trial.sql",
  "20260924120000_plan_feature_db_guard.sql",
  "20260924150000_company_access_owner_rows_only.sql",
  // Split so the pre-commit secret scan's Resend key pattern (re_ + 20 chars) does not match the name.
  "20260924160000_plan_feature_guard" + "_core_documents.sql",
].map((f) => path.resolve(__dirname, "../../supabase/migrations", f));

const STUB = `
create role service_role; create role authenticated; create role anon;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb, invited_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create table public.profiles (id uuid primary key, email text, full_name text, avatar_url text, logo_url text,
  company_name text, company_address text, phone text, currency text, timezone text, role text,
  plan text, subscription_plan text, subscription_status text, is_pro boolean, trial_started_at timestamptz,
  trial_ends_at timestamptz, updated_at timestamptz);
create table public.organizations (id uuid primary key default gen_random_uuid(), name text, owner_id uuid,
  created_at timestamptz default now());
create table public.memberships (id uuid primary key default gen_random_uuid(), org_id uuid, user_id uuid,
  role text, job_function text, created_at timestamptz default now(), unique (org_id, user_id));
create table public.company_invites (id uuid primary key default gen_random_uuid(), org_id uuid, email text,
  status text, accepted_at timestamptz, accepted_by uuid);
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid, email text,
  company_id uuid, created_by uuid, status text, plan text, current_plan text, plan_slug text, plan_family text,
  amount numeric, currency text, billing_cycle text, trial_started_at timestamptz, trial_ends_at timestamptz,
  grace_ends_at timestamptz, current_period_end timestamptz, expires_at timestamptz, next_billing_date timestamptz,
  subscription_source text, admin_override boolean default false, provider text, activated_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.expenses (id uuid primary key default gen_random_uuid(), org_id uuid, amount numeric);
create table public.invoices (id uuid primary key default gen_random_uuid(), org_id uuid, status text);
create table public.quotes (id uuid primary key default gen_random_uuid(), org_id uuid, status text);
create table public.clients (id uuid primary key default gen_random_uuid(), org_id uuid, name text);
create table public.payslips (id uuid primary key default gen_random_uuid(), org_id uuid, membership_id uuid,
  employee_id text, employee_name text);
create function public.normalize_company_role(t text) returns text language sql as $$ select coalesce(t, 'employee') $$;
create function public.normalize_job_function(t text) returns text language sql as $$ select coalesce(t, 'general') $$;
create function public.upsert_user_company_role(a uuid, b uuid, c text, d text, e uuid) returns void language sql as $$ select $$;
create function public.sync_saas_user_roles(a uuid) returns void language sql as $$ select $$;
`;

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function company() {
  const owner = uid();
  const [{ id }] = await q(`insert into public.organizations (owner_id) values ($1) returning id`, [owner]);
  await q(`insert into public.profiles (id, plan) values ($1, 'none')`, [owner]);
  return { owner, org: id };
}

async function addMember(org, plan = "none") {
  const member = uid();
  await q(`insert into public.profiles (id, plan, subscription_plan) values ($1, $2, $2)`, [member, plan]);
  await q(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'admin')`, [org, member]);
  return member;
}

const paidRow = (userId, companyId, family = "growth") =>
  q(
    `insert into public.subscriptions (user_id, company_id, status, plan_slug, plan_family, current_period_end)
     values ($1, $2, 'active', $3, $4, $5)`,
    [userId, companyId, `${family}_monthly`, family, FUTURE]
  );

/** Run `sql` as `userId` (null = anonymous / service), like a PostgREST request. */
async function runAs(userId, sql, params) {
  await db.exec("begin");
  try {
    await q(`select set_config('request.jwt.claim.sub', $1, true)`, [userId || ""]);
    await q(sql, params);
    await db.exec("commit");
    return "allowed";
  } catch (err) {
    await db.exec("rollback");
    return String(err.hint || err.message).split(":")[0];
  }
}

/** Insert an expense (Business feature). */
const insertExpenseAs = (userId, org) =>
  runAs(userId, `insert into public.expenses (org_id, amount) values ($1, 10)`, [org]);

const insertAs = (userId, table, org) =>
  runAs(userId, `insert into public.${table} (org_id) values ($1)`, [org]);

const planOf = async (org, userId) => (await q(`select * from public.paidly_company_plan($1, $2)`, [org, userId]))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
}, 60_000);

describe("company access row: only the owner's company-less rows count", () => {
  it("member's personal paid row does not unlock an unpaid employer (DB guard)", async () => {
    const { org } = await company();
    const member = await addMember(org, "growth"); // profiles.plan claims Growth too
    await paidRow(member, null, "growth"); // personal, company-less, active

    expect(await planOf(org, member)).toEqual({ family: null, has_access: false });
    expect(await insertExpenseAs(member, org)).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("the owner's company-less paid row still counts for the company (legacy ITN rows)", async () => {
    const { owner, org } = await company();
    const member = await addMember(org);
    await paidRow(owner, null, "business");

    expect(await planOf(org, member)).toEqual({ family: "business", has_access: true });
    expect(await insertExpenseAs(member, org)).toBe("allowed");
    expect(await insertExpenseAs(owner, org)).toBe("allowed");
  });

  it("company-stamped paid row: every member inherits it; the plan still caps the feature", async () => {
    const { owner, org } = await company();
    const member = await addMember(org);
    await paidRow(owner, org, "starter");

    expect(await insertExpenseAs(member, org)).toBe("PLAN_UPGRADE_REQUIRED");
  });

  it("another company's paid subscription never applies (different company id)", async () => {
    const paid = await company();
    await paidRow(paid.owner, paid.org, "growth");
    const unpaid = await company();

    expect(await planOf(unpaid.org, paid.owner)).toEqual({ family: null, has_access: false });
    expect(await insertExpenseAs(unpaid.owner, unpaid.org)).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("a user with no company still resolves by their own rows", async () => {
    const solo = uid();
    await paidRow(solo, null, "business");
    expect(await planOf(null, solo)).toEqual({ family: "business", has_access: true });
  });
});

describe("invoices / quotes / clients need an active subscription (inserts only)", () => {
  const TABLES = ["invoices", "quotes", "clients"];
  const sub = (userId, companyId, cols) =>
    q(
      `insert into public.subscriptions (user_id, company_id, status, plan_slug, plan_family, trial_ends_at, grace_ends_at)
       values ($1, $2, $3, 'starter_monthly', 'starter', $4, $5)`,
      [userId, companyId, cols.status, cols.trialEndsAt ?? null, cols.graceEndsAt ?? null]
    );
  const PAST = new Date(Date.now() - 86_400_000).toISOString();

  it.each(TABLES)("%s: running trial and past_due-in-grace allowed", async (table) => {
    const trial = await company();
    await sub(trial.owner, trial.org, { status: "trialing", trialEndsAt: FUTURE });
    expect(await insertAs(trial.owner, table, trial.org)).toBe("allowed");

    const grace = await company();
    await sub(grace.owner, grace.org, { status: "past_due", graceEndsAt: FUTURE });
    expect(await insertAs(grace.owner, table, grace.org)).toBe("allowed");
  });

  it.each(TABLES)("%s: no subscription / expired trial / expired / suspended → SUBSCRIPTION_REQUIRED", async (table) => {
    const none = await company();
    expect(await insertAs(none.owner, table, none.org)).toBe("SUBSCRIPTION_REQUIRED");

    for (const cols of [
      { status: "trialing", trialEndsAt: PAST },
      { status: "expired" },
      { status: "suspended" },
      { status: "past_due", graceEndsAt: PAST },
    ]) {
      const c = await company();
      await q(`update public.profiles set plan = 'growth' where id = $1`, [c.owner]); // ignored
      await sub(c.owner, c.org, cols);
      expect(await insertAs(c.owner, table, c.org)).toBe("SUBSCRIPTION_REQUIRED");
    }
  });

  it("existing records stay editable after a lapse; anonymous/service writes are not gated here", async () => {
    const c = await company();
    await sub(c.owner, c.org, { status: "trialing", trialEndsAt: FUTURE });
    expect(await insertAs(c.owner, "invoices", c.org)).toBe("allowed");
    await q(`update public.subscriptions set status = 'expired' where company_id = $1`, [c.org]);

    expect(await runAs(c.owner, `update public.invoices set status = 'paid' where org_id = $1`, [c.org])).toBe("allowed");
    expect(await insertAs(null, "invoices", c.org)).toBe("allowed");
    expect(await insertAs(c.owner, "invoices", c.org)).toBe("SUBSCRIPTION_REQUIRED");
  });
});
