/**
 * 20261003120000_employee_catalog_scope_and_org_move_guard.sql must apply on BOTH database shapes:
 *   - the replayed schema, where deliveries.org_id exists (20260518110000_deliveries_schema_hardening.sql), and
 *   - production as reported 2026-10-03, where that column is missing ("42703: column org_id does not exist").
 * It must also be safe to run twice (the SQL editor run that failed may be retried), and end with exactly
 * one non-admin deliveries policy whatever drifted policies were there before.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/20261003120000_employee_catalog_scope_and_org_move_guard.sql"),
  "utf8"
);

const OWNER = "d8000000-0000-4000-8000-000000000001";
const STAFF = "d8000000-0000-4000-8000-000000000002";

async function seedCompany(db) {
  const q = (s, p) => db.query(s, p);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'o@x.test', '{"org_name":"Shop"}')`, [OWNER]);
  const org = (await q(`select id from public.organizations where owner_id = $1`, [OWNER])).rows[0].id;
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, 's@x.test', now(), '{"pending_company_invite":"true"}')`, [STAFF]);
  await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, 'employee', 'sales')`, [org, STAFF]);
  const product = (await q(
    `insert into public.services (org_id, name, default_unit, item_type, created_by_id) values ($1, 'Widget', 'unit', 'product', $2) returning id`,
    [org, OWNER]
  )).rows[0].id;
  await q(`insert into public.deliveries (id, product_id, quantity, status) values (gen_random_uuid()::text, $1, 5, 'pending')`, [product]);
  return { org, product };
}

const deliveryPolicies = async (db) =>
  (await db.query(`select policyname from pg_policies where schemaname = 'public' and tablename = 'deliveries' order by 1`)).rows.map(
    (r) => r.policyname
  );

describe("schema with deliveries.org_id (replayed migrations)", () => {
  let db;
  beforeAll(async () => {
    db = await replaySupabaseSchema();
    await seedCompany(db);
  }, 180_000);

  it("re-applies cleanly and keeps one scoped policy", async () => {
    await db.exec(MIGRATION);
    expect(await deliveryPolicies(db)).toEqual(["admin full access deliveries_v2", "org managers manage deliveries"]);
  });

  it("owner reads deliveries; plain staff does not", async () => {
    expect((await runAs(db, OWNER, `select id from public.deliveries`)).rows).toHaveLength(1);
    expect((await runAs(db, STAFF, `select id from public.deliveries`)).rows).toHaveLength(0);
  });
});

describe("production shape: deliveries has no org_id", () => {
  let db;
  let product;
  beforeAll(async () => {
    process.env.PAIDLY_REPLAY_BEFORE = "20261003120000";
    try {
      db = await replaySupabaseSchema();
    } finally {
      delete process.env.PAIDLY_REPLAY_BEFORE;
    }
    // Recreate the reported state: no org_id column, an unknown drifted bare-member policy.
    await db.exec(`
      DO $$ DECLARE p record; BEGIN
        FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deliveries' LOOP
          EXECUTE format('DROP POLICY %I ON public.deliveries', p.policyname);
        END LOOP;
      END $$;
      ALTER TABLE public.deliveries DROP COLUMN IF EXISTS org_id CASCADE;
      -- worst case: also missed 20260327120000 (product_id still text, no FK to services)
      ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_product_id_fkey;
      ALTER TABLE public.deliveries ALTER COLUMN product_id TYPE text USING product_id::text;
      CREATE POLICY "admin full access deliveries_v2" ON public.deliveries FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
      CREATE POLICY "legacy members deliveries" ON public.deliveries FOR ALL USING (true) WITH CHECK (true);
    `);
    ({ product } = await seedCompany(db));
  }, 180_000);

  it("applies without '42703 column org_id does not exist', and again on retry", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it("drifted bare policies are gone; deliveries are scoped through their product", async () => {
    expect(await deliveryPolicies(db)).toEqual(["admin full access deliveries_v2", "org managers manage deliveries"]);
    expect((await runAs(db, OWNER, `select id from public.deliveries`)).rows).toHaveLength(1);
    expect((await runAs(db, STAFF, `select id from public.deliveries`)).rows).toHaveLength(0);
    const ins = await runAs(db, STAFF, `insert into public.deliveries (id, product_id, quantity, status) values (gen_random_uuid()::text, $1, 1, 'pending')`, [product]);
    expect(ins.ok).toBe(false);
    const own = await runAs(db, OWNER, `insert into public.deliveries (id, product_id, quantity, status) values (gen_random_uuid()::text, $1, 1, 'pending') returning id`, [product]);
    expect(own.ok, own.message).toBe(true);
  });
});
