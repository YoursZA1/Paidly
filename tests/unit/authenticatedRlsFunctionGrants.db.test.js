/**
 * 20260925120000_restore_authenticated_rls_function_grants.sql on real Postgres (PGlite).
 * Reproduces the production 403: EXECUTE on an RLS helper revoked from `authenticated` makes every
 * signed-in SELECT on the table fail with 42501; the migration restores exactly what policies and the
 * SPA's RPCs need — for authenticated only, never anon.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260925120000_restore_authenticated_rls_function_grants.sql"
);

const STUB = `
create role authenticated; create role anon; create role service_role bypassrls;
create schema auth;
grant usage on schema auth to authenticated, anon;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;

create table public.organizations (id uuid primary key, owner_id uuid, created_at timestamptz default now());
create table public.memberships (org_id uuid, user_id uuid, role text);
alter table public.organizations enable row level security;
grant select on public.organizations, public.memberships to authenticated, anon;

-- invoker helper → calls another helper (must be closed over)
create function public.membership_role_for(p_org uuid) returns text language sql stable as
  $$ select role from public.memberships where org_id = p_org and user_id = auth.uid() $$;
create function public.is_company_admin_for_org(p_org uuid) returns boolean language sql stable as
  $$ select public.membership_role_for(p_org) in ('owner', 'admin') $$;
create function public.get_my_tenant_context() returns jsonb language sql stable security definer as
  $$ select jsonb_build_object('uid', auth.uid()) $$;
create function public.unrelated_admin_tool() returns int language sql as $$ select 1 $$;

create policy "org members read org" on public.organizations for select
  using (owner_id = auth.uid() or public.is_company_admin_for_org(id));

-- the out-of-band sweep that broke production
revoke execute on function public.membership_role_for(uuid), public.is_company_admin_for_org(uuid),
  public.get_my_tenant_context(), public.unrelated_admin_tool() from public, authenticated, anon;
`;

const USER = "20000000-0000-4000-8000-000000000001";
let db;

async function as(role, sql) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [role === "authenticated" ? USER : ""]);
    await db.exec(`set local role ${role}`);
    const r = await db.query(sql);
    await db.exec("commit");
    return { ok: true, rows: r.rows };
  } catch (err) {
    await db.exec("rollback");
    return { ok: false, code: err.code, message: err.message };
  }
}

const canExec = async (role, fn) =>
  (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])).rows[0].ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.query(`insert into public.organizations (id, owner_id) values (gen_random_uuid(), $1)`, [USER]);
}, 60_000);

describe("restore authenticated EXECUTE for RLS helpers", () => {
  it("reproduces the production failure before the migration", async () => {
    const r = await as("authenticated", `select id from public.organizations where owner_id = '${USER}'`);
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect(r.message).toMatch(/is_company_admin_for_org/);
  });

  it("after the migration signed-in reads and the RPC work; anon and unrelated functions unchanged", async () => {
    await db.exec(readFileSync(MIGRATION, "utf8"));
    await db.exec(readFileSync(MIGRATION, "utf8")); // idempotent

    const orgs = await as("authenticated", `select id from public.organizations where owner_id = '${USER}'`);
    expect(orgs.ok).toBe(true);
    expect(orgs.rows).toHaveLength(1);
    expect((await as("authenticated", `select public.get_my_tenant_context()`)).ok).toBe(true);

    expect(await canExec("authenticated", "public.membership_role_for(uuid)")).toBe(true); // closed over
    expect(await canExec("anon", "public.is_company_admin_for_org(uuid)")).toBe(false);
    expect(await canExec("anon", "public.get_my_tenant_context()")).toBe(false);
    expect(await canExec("authenticated", "public.unrelated_admin_tool()")).toBe(false);
    expect((await as("anon", `select id from public.organizations`)).code).toBe("42501");
  });
});
