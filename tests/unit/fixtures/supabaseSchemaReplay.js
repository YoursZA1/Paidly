/**
 * Replays the real Paidly schema (supabase/schema.postgres.sql + every migration, in order) on in-process
 * Postgres (PGlite) with the Supabase pieces the migrations assume stubbed: auth/storage/cron schemas,
 * anon/authenticated/service_role, auth.uid()/auth.jwt(), and Supabase's default GRANT ALL on public tables
 * to anon/authenticated (so RLS — not a missing grant — is what the tests exercise).
 *
 * `runAs(userId, sql)` executes like a PostgREST request: `SET LOCAL ROLE authenticated` + JWT sub claim.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema extensions; create schema cron;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(),
  updated_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb, invited_at timestamptz, email_confirmed_at timestamptz,
  last_sign_in_at timestamptz, deleted_at timestamptz, banned_until timestamptz, phone text,
  confirmed_at timestamptz, is_sso_user boolean default false, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.email() returns text language sql stable as
  $$ select (select email from auth.users where id = auth.uid()) $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, owner_id text, metadata jsonb, path_tokens text[], created_at timestamptz default now(),
  updated_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as
  $$ select split_part(name, '.', -1) $$;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
create table cron.job (jobid bigint, jobname text);
create publication supabase_realtime;
-- pgcrypto is not bundled with PGlite; these cover what the migrations call.
create function public.gen_random_bytes(n int) returns bytea language sql volatile as
  $$ select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
create function public.digest(data text, alg text) returns bytea language sql immutable as
  $$ select sha256(convert_to(data, 'UTF8')) $$;
create function public.digest(data bytea, alg text) returns bytea language sql immutable as
  $$ select sha256(data) $$;
-- Exists only in production (created out of band); 20260325230000 alters its search_path.
create function public.set_business_goals_updated_at() returns trigger language plpgsql as
  $$ begin return new; end $$;
`;

/** `PAIDLY_REPLAY_BEFORE=<file prefix>` stops before that migration (reproduce pre-fix behaviour). */
export function migrationFiles() {
  const before = String(process.env.PAIDLY_REPLAY_BEFORE || "").trim();
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("._"))
    .filter((f) => !before || f < before)
    .sort();
}

/** @returns {Promise<PGlite>} a database with every migration applied (throws on the first failure). */
export async function replaySupabaseSchema() {
  const db = new PGlite({ extensions: { citext, uuid_ossp } });
  await db.exec(SUPABASE_STUB);
  await db.exec(readFileSync(path.join(ROOT, "supabase/schema.postgres.sql"), "utf8"));
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(
      /create extension if not exists pgcrypto;/gi,
      ""
    );
    try {
      await db.exec(sql);
    } catch (err) {
      err.message = `${file}: ${err.message}`;
      throw err;
    }
  }
  return db;
}

/**
 * Run SQL as a signed-in end user through RLS (like a PostgREST request).
 * @returns {Promise<{ ok: true, rows: any[] } | { ok: false, code?: string, message: string }>}
 */
export async function runAs(db, userId, sql, params = [], { claims = {} } = {}) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId || ""]);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId || undefined, role: userId ? "authenticated" : "anon", ...claims }),
    ]);
    await db.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return { ok: true, rows: r.rows, affectedRows: r.affectedRows };
  } catch (err) {
    await db.exec("rollback");
    return { ok: false, code: err.code, message: String(err.message || err) };
  }
}
