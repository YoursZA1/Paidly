/**
 * Tenant subscription history RLS on real Postgres (PGlite, in-process).
 *
 * Rebuilds the pre-fix production shape — billing v2's `subscriptions_select_company` +
 * `subscriptions_admin_all` (SECURITY DEFINER helpers), the real 20260814210000 migration,
 * Supabase default table grants, and EXECUTE on the helpers revoked outside migrations —
 * then applies 20260924130000 and checks who can read what.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migration = (name) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", name), "utf8");
const GRANTS_AND_OWN_SELECT = migration("20260814210000_subscriptions_grants_and_own_select.sql");
const TENANT_READ_OWN_ONLY = migration("20260924130000_subscriptions_tenant_read_own_only.sql");

const STUB = `
create role service_role bypassrls; create role authenticated; create role anon;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table auth.users (id uuid primary key, email text);

create table public.plans (id uuid primary key default gen_random_uuid(), slug text);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  company_id uuid, created_by uuid, email text,
  plan text, current_plan text, status text, amount numeric, custom_price numeric, billing_cycle text,
  provider text, next_billing_date timestamptz, last_payment_at timestamptz, start_date timestamptz,
  payfast_subscription_id text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- Supabase default privileges on new public tables
grant all on public.subscriptions to anon, authenticated, service_role;
grant all on public.plans to anon, authenticated, service_role;

-- Billing v2 (20260715170000) helpers + policies, verbatim shape
create function public.is_billing_admin() returns boolean language sql stable security definer
  set search_path = public as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;
create function public.current_company_id() returns uuid language sql stable security definer
  set search_path = public as $$ select nullif(btrim(coalesce(auth.jwt() ->> 'company_id', '')), '')::uuid $$;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.is_billing_admin() to authenticated;
alter table public.subscriptions enable row level security;
create policy "subscriptions_select_company" on public.subscriptions for select to authenticated
  using (public.is_billing_admin() or (company_id is not null and company_id = (select public.current_company_id())));
create policy "subscriptions_admin_all" on public.subscriptions for all to authenticated
  using (public.is_billing_admin()) with check (public.is_billing_admin());
revoke insert, update, delete on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
`;

/** Out-of-band hardening seen in production: SECURITY DEFINER helpers no longer executable by JWT roles. */
const REVOKE_HELPERS = `
revoke execute on function public.current_company_id() from public, anon, authenticated;
revoke execute on function public.is_billing_admin() from public, anon, authenticated;
`;

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const USER_NONE = "00000000-0000-4000-8000-00000000000c";
const ADMIN = "00000000-0000-4000-8000-00000000000d";
const COMPANY_1 = "11111111-1111-4111-8111-111111111111";

const SEED = `
insert into auth.users (id, email) values
  ('${USER_A}', 'a@x.co'), ('${USER_B}', 'b@x.co'), ('${USER_NONE}', 'c@x.co'), ('${ADMIN}', 'admin@x.co');
insert into public.subscriptions (id, user_id, company_id, status, plan, provider, payfast_subscription_id, created_at) values
  ('a0000000-0000-4000-8000-000000000001', '${USER_A}', null,           'active',   'growth',   'payfast', 'pf-token-a', now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000002', '${USER_A}', '${COMPANY_1}', 'trialing', 'business', 'system',  null,         now() - interval '2 days'),
  ('a0000000-0000-4000-8000-000000000003', '${USER_A}', '${COMPANY_1}', 'expired',  'starter',  'payfast', 'pf-token-a0', now() - interval '3 days'),
  ('b0000000-0000-4000-8000-000000000001', '${USER_B}', '${COMPANY_1}', 'active',   'starter',  'payfast', 'pf-token-b', now()),
  ('d0000000-0000-4000-8000-000000000001', '${ADMIN}',  null,           'active',   'growth',   'admin',   null,         now()),
  ('00000000-0000-4000-8000-0000000000ff', null,        '${COMPANY_1}', 'active',   'growth',   'admin',   null,         now());
`;

let db;

async function asRole(role, claims, sql) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims ? JSON.stringify(claims) : ""]);
    await tx.exec(`set local role ${role}`);
    return (await tx.query(sql)).rows;
  });
}

const asUser = (sub, sql, extraClaims = {}) =>
  asRole("authenticated", { sub, role: "authenticated", ...extraClaims }, sql);

/** The exact shape of the browser query (useMySubscriptionsQuery). */
const historyQuery = (userId) =>
  `select id, user_id, status, company_id, provider, payfast_subscription_id from public.subscriptions
   where user_id = '${userId}' order by created_at desc`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(GRANTS_AND_OWN_SELECT);
  await db.exec(SEED);
}, 60_000);

describe("before 20260924130000 (root cause reproduction)", () => {
  it("own-row reads work while the helper functions are executable", async () => {
    const rows = await asUser(USER_A, historyQuery(USER_A));
    expect(rows.map((r) => r.status)).toEqual(["active", "trialing", "expired"]);
  });

  it("company policy leaks a company-mate's agreement (company_id as the only boundary)", async () => {
    const rows = await asUser(USER_A, historyQuery(USER_B), { company_id: COMPANY_1 });
    expect(rows).toHaveLength(1);
  });

  it("with helper EXECUTE revoked, every signed-in history read fails — even with zero rows", async () => {
    await db.exec(REVOKE_HELPERS);
    await expect(asUser(USER_A, historyQuery(USER_A))).rejects.toThrow(/permission denied for function/);
    await expect(asUser(USER_NONE, historyQuery(USER_NONE))).rejects.toThrow(/permission denied for function/);
  });

  it("anon still holds table SELECT (RLS returns nothing, but the grant exists)", async () => {
    await expect(asRole("anon", null, `select id from public.subscriptions`)).resolves.toEqual([]);
  });
});

describe("after 20260924130000", () => {
  beforeAll(async () => {
    // Helpers stay revoked: the fix must not depend on them. Run twice to prove idempotency.
    await db.exec(TENANT_READ_OWN_ONLY);
    await db.exec(TENANT_READ_OWN_ONLY);
  });

  it("leaves exactly one policy: SELECT own rows by auth.uid()", async () => {
    const policies = await db.query(
      `select policyname, cmd, roles::text as roles, qual from pg_policies
       where schemaname = 'public' and tablename = 'subscriptions'`
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]).toMatchObject({ policyname: "subscriptions_user_select_own", cmd: "SELECT", roles: "{authenticated}" });
    expect(policies.rows[0].qual).toMatch(/auth\.uid\(\)/);
    expect(policies.rows[0].qual).not.toMatch(/true\)?$|company|admin/i);
  });

  it("1–3, 8–10: owner sees active, trialing, expired and PayFast rows, company_id null or set", async () => {
    const rows = await asUser(USER_A, historyQuery(USER_A));
    expect(rows.map((r) => r.status)).toEqual(["active", "trialing", "expired"]);
    expect(rows.every((r) => r.user_id === USER_A)).toBe(true);
    expect(rows.some((r) => r.company_id === null)).toBe(true);
    expect(rows.some((r) => r.company_id === COMPANY_1)).toBe(true);
    expect(rows.filter((r) => r.provider === "payfast").map((r) => r.payfast_subscription_id)).toEqual([
      "pf-token-a",
      "pf-token-a0",
    ]);
  });

  it("4: user with no subscription gets an empty result, not an error", async () => {
    await expect(asUser(USER_NONE, historyQuery(USER_NONE))).resolves.toEqual([]);
  });

  it("5: user A cannot read user B's rows, even sharing a company or asking by id", async () => {
    expect(await asUser(USER_A, historyQuery(USER_B), { company_id: COMPANY_1 })).toEqual([]);
    expect(await asUser(USER_A, `select id from public.subscriptions where id = 'b0000000-0000-4000-8000-000000000001'`)).toEqual([]);
    const unfiltered = await asUser(USER_B, `select user_id from public.subscriptions`);
    expect(unfiltered.map((r) => r.user_id)).toEqual([USER_B]);
  });

  it("rows without an owner (user_id null) are visible to no tenant", async () => {
    for (const sub of [USER_A, USER_B, USER_NONE, ADMIN]) {
      expect(await asUser(sub, `select id from public.subscriptions where user_id is null`)).toEqual([]);
    }
  });

  it("6: an admin JWT gets only its own rows; full access stays on service_role (/api/admin)", async () => {
    const own = await asUser(ADMIN, `select user_id from public.subscriptions`, { app_metadata: { role: "admin" } });
    expect(own.map((r) => r.user_id)).toEqual([ADMIN]);
    const all = await asRole("service_role", null, `select count(*)::int as n from public.subscriptions`);
    expect(all[0].n).toBe(6);
  });

  it("7: anon (logged out) has no access at all", async () => {
    await expect(asRole("anon", null, `select id from public.subscriptions`)).rejects.toThrow(/permission denied for table subscriptions/);
  });

  it("a request without a JWT subject reads nothing", async () => {
    expect(await asRole("authenticated", {}, `select id from public.subscriptions`)).toEqual([]);
  });

  it("authenticated users cannot write billing rows", async () => {
    await expect(
      asUser(USER_A, `insert into public.subscriptions (user_id, status) values ('${USER_A}', 'active')`)
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(USER_A, `update public.subscriptions set status = 'active' where user_id = '${USER_A}'`)
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(USER_A, `delete from public.subscriptions where user_id = '${USER_A}'`)).rejects.toThrow(
      /permission denied/
    );
  });
});
