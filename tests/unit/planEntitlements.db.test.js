/**
 * Runs migration 20260921140000_canonical_plan_entitlements.sql on real Postgres (PGlite, in-process)
 * against a minimal stub of the tables it touches, then checks:
 *   - signup trial uses the selected package (Starter / Business / Growth; others → Starter)
 *   - the subscriptions → profiles mirror follows the company ACCESS row, for every member,
 *     and a pending checkout never overwrites a live package
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260921140000_canonical_plan_entitlements.sql"
);

const STUB = `
create role service_role; create role authenticated; create role anon;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb, invited_at timestamptz);
create table public.profiles (id uuid primary key, email text, full_name text, avatar_url text, logo_url text,
  company_name text, company_address text, phone text, currency text, timezone text, role text,
  plan text, subscription_plan text, subscription_status text, is_pro boolean, trial_started_at timestamptz,
  trial_ends_at timestamptz, updated_at timestamptz);
create table public.organizations (id uuid primary key default gen_random_uuid(), name text, owner_id uuid,
  created_at timestamptz default now());
create table public.memberships (id uuid primary key default gen_random_uuid(), org_id uuid, user_id uuid,
  role text, job_function text, unique (org_id, user_id));
create table public.company_invites (id uuid primary key default gen_random_uuid(), org_id uuid, email text,
  status text, accepted_at timestamptz, accepted_by uuid);
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid, email text,
  company_id uuid, created_by uuid, status text, plan text, current_plan text, plan_slug text, plan_family text,
  amount numeric, currency text, billing_cycle text, trial_started_at timestamptz, trial_ends_at timestamptz,
  grace_ends_at timestamptz, current_period_end timestamptz, expires_at timestamptz, next_billing_date timestamptz,
  subscription_source text, admin_override boolean default false, provider text, activated_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
create function public.normalize_company_role(t text) returns text language sql as $$ select coalesce(t, 'employee') $$;
create function public.normalize_job_function(t text) returns text language sql as $$ select coalesce(t, 'general') $$;
create function public.upsert_user_company_role(a uuid, b uuid, c text, d text, e uuid) returns void language sql as $$ select $$;
create function public.sync_saas_user_roles(a uuid) returns void language sql as $$ select $$;
`;

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const profile = async (id) =>
  (await q(`select plan, subscription_status, is_pro from public.profiles where id = $1`, [id]))[0];
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

async function signup(plan) {
  const id = uid();
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${id}@x.co`,
    JSON.stringify(plan == null ? {} : { plan }),
  ]);
  const org = (await q(`select id from public.organizations where owner_id = $1`, [id]))[0].id;
  return { id, org };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec(
    `create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`
  );
}, 60_000);

describe("signup trial uses the selected package", () => {
  it.each([
    ["starter", "starter"],
    ["business", "business"],
    ["growth", "growth"],
    ["growth_annual", "growth"],
    ["enterprise", "starter"],
    ["nonsense", "starter"],
    [null, "starter"],
  ])("signup plan %s → %s trial", async (selected, expected) => {
    const { id, org } = await signup(selected);
    const [sub] = await q(`select plan_family, status, plan_slug from public.subscriptions where company_id = $1`, [org]);
    expect(sub).toEqual({ plan_family: expected, status: "trialing", plan_slug: `${expected}_monthly` });
    expect(await profile(id)).toEqual({ plan: expected, subscription_status: "trial", is_pro: true });
  });
});

describe("profiles mirror the company access row", () => {
  it("expired trial keeps the package name; members follow; pending checkout does not overwrite", async () => {
    const { id: owner, org } = await signup("growth");
    const member = uid();
    await q(`insert into public.profiles (id, plan, subscription_status) values ($1, 'free', 'inactive')`, [member]);
    await q(`insert into public.memberships (org_id, user_id) values ($1, $2)`, [org, member]);

    await q(`update public.subscriptions set trial_ends_at = now() - interval '1 day' where company_id = $1`, [org]);
    expect(await profile(owner)).toEqual({ plan: "growth", subscription_status: "expired", is_pro: false });
    expect(await profile(member)).toEqual({ plan: "growth", subscription_status: "expired", is_pro: false });

    await q(
      `update public.subscriptions set status = 'active', plan = 'business', plan_family = 'business',
         plan_slug = 'business_monthly', trial_ends_at = null where company_id = $1`,
      [org]
    );
    expect(await profile(member)).toEqual({ plan: "business", subscription_status: "active", is_pro: true });

    await q(
      `insert into public.subscriptions (user_id, company_id, status, plan, plan_slug, plan_family)
       values ($1, $2, 'pending', 'growth', 'growth_monthly', 'growth')`,
      [owner, org]
    );
    expect(await profile(owner)).toEqual({ plan: "business", subscription_status: "active", is_pro: true });
  });

  it("no second trial when the company already has a subscription", async () => {
    const { id, org } = await signup("business");
    await q(`select public.start_owner_system_trial($1, $2, 'growth')`, [id, org]);
    const rows = await q(`select plan_family from public.subscriptions where company_id = $1`, [org]);
    expect(rows).toEqual([{ plan_family: "business" }]);
  });
});
