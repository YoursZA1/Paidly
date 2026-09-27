/**
 * 20260927120000_pos_operator_access.sql on real Postgres (PGlite): applies cleanly (twice) on top of
 * the restaurant migration, one active code per employee, many tables per operator, and access codes
 * are invisible to browsers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => readFileSync(path.resolve(__dirname, `../../supabase/migrations/${name}`), "utf8");
const RESTAURANT = read("20260927100000_pos_restaurant_tables.sql");
const OPERATOR = read("20260927120000_pos_operator_access.sql");

const STUB = `
create role service_role bypassrls; create role authenticated; create role anon;
create schema auth;
create table auth.users (id uuid primary key);
grant usage on schema auth to authenticated, service_role;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, service_role;
create table public.organizations (id uuid primary key, business_type text,
  constraint organizations_business_type_check check (business_type is null or business_type in ('service','retail','mixed')));
create table public.memberships (id uuid primary key default gen_random_uuid(), org_id uuid, user_id uuid, role text, job_function text);
create function public.is_org_member(target uuid) returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.memberships m where m.org_id = target and m.user_id = auth.uid()) $$;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
create table public.services (id uuid primary key, org_id uuid, name text);
create table public.pos_registers (id uuid primary key, org_id uuid);
create table public.pos_register_sessions (id uuid primary key, org_id uuid);
create table public.payment_intents (id uuid primary key default gen_random_uuid(), org_id uuid);
create table public.pos_access_sessions (id uuid primary key default gen_random_uuid(), org_id uuid, token_hash text not null,
  revoked_at timestamptz, expires_at timestamptz not null default now() + interval '1 day');
grant usage on schema public to authenticated, service_role;
grant select on public.memberships to authenticated;
`;

const ORG = "10000000-0000-4000-8000-000000000001";
const USER = "20000000-0000-4000-8000-000000000001";
let db;
let mando;
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function asUser(sql, params) {
  await db.exec("begin");
  try {
    await q(`select set_config('request.jwt.claim.sub', $1, true)`, [USER]);
    await db.exec("set local role authenticated");
    const rows = await q(sql, params);
    await db.exec("commit");
    return { ok: true, rows };
  } catch (err) {
    await db.exec("rollback");
    return { ok: false, code: err.code };
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(RESTAURANT);
  await db.exec(OPERATOR);
  await db.exec(OPERATOR); // idempotent
  await q(`insert into public.organizations (id) values ($1)`, [ORG]);
  mando = (await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, 'employee', 'pos') returning id`, [ORG, USER]))[0].id;
}, 60_000);

describe("operator access schema", () => {
  it("one active code per employee; a revoked code frees the slot", async () => {
    await q(`insert into public.pos_access_codes (org_id, membership_id, code_hash) values ($1, $2, 'h1')`, [ORG, mando]);
    await expect(q(`insert into public.pos_access_codes (org_id, membership_id, code_hash) values ($1, $2, 'h2')`, [ORG, mando])).rejects.toThrow(
      /one_active_per_member/
    );
    await q(`update public.pos_access_codes set revoked_at = now() where membership_id = $1`, [mando]);
    await q(`insert into public.pos_access_codes (org_id, membership_id, code_hash) values ($1, $2, 'h2')`, [ORG, mando]);
  });

  it("an active code value is unique inside a business", async () => {
    const other = (await q(`insert into public.memberships (org_id, role, job_function) values ($1, 'employee', 'pos') returning id`, [ORG]))[0].id;
    await expect(q(`insert into public.pos_access_codes (org_id, membership_id, code_hash) values ($1, $2, 'h2')`, [ORG, other])).rejects.toThrow(
      /active_hash_per_org/
    );
  });

  it("many tables can be assigned to one operator; sessions and tabs carry operator attribution", async () => {
    const floor = (await q(`insert into public.pos_floors (org_id, name) values ($1, 'Main') returning id`, [ORG]))[0].id;
    for (const name of ["1", "2", "5", "7"]) {
      await q(`insert into public.pos_tables (org_id, floor_id, name, assigned_membership_id) values ($1, $2, $3, $4)`, [ORG, floor, name, mando]);
    }
    expect((await q(`select count(*)::int as n from public.pos_tables where assigned_membership_id = $1`, [mando]))[0].n).toBe(4);
    const cols = await q(
      `select table_name, column_name from information_schema.columns
       where (table_name = 'pos_tabs' and column_name in ('server_membership_id','register_session_id'))
          or (table_name = 'pos_access_sessions' and column_name in ('membership_id','credential_id'))
          or (table_name = 'memberships' and column_name = 'pos_access_disabled_at')`
    );
    expect(cols).toHaveLength(5);
  });

  it("browsers can't read access codes or failures; custom providers are org-readable only", async () => {
    expect((await asUser(`select * from public.pos_access_codes`)).ok).toBe(false);
    expect((await asUser(`select * from public.pos_access_code_failures`)).ok).toBe(false);
    await q(`insert into public.pos_custom_providers (org_id, provider_name) values ($1, 'PayFast')`, [ORG]);
    const read = await asUser(`select provider_name, status from public.pos_custom_providers`);
    expect(read.rows).toEqual([{ provider_name: "PayFast", status: "requested" }]);
    expect((await asUser(`insert into public.pos_custom_providers (org_id, provider_name) values ($1, 'X')`, [ORG])).ok).toBe(false);
  });
});
