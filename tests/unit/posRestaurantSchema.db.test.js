/**
 * Restaurant POS migration against real Postgres (PGlite): applies cleanly (twice), enforces
 * one open order per table, accepts the restaurant business type, and keeps writes server-side.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/20260927100000_pos_restaurant_tables.sql"),
  "utf8"
);

const COUNTER = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260927140000_pos_counter_orders.sql"), "utf8");

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
create table public.org_members (org_id uuid, user_id uuid);
create function public.is_org_member(target uuid) returns boolean language sql stable security definer as
  $$ select exists (select 1 from public.org_members m where m.org_id = target and m.user_id = auth.uid()) $$;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
create table public.services (id uuid primary key, org_id uuid, name text);
create table public.pos_registers (id uuid primary key, org_id uuid);
create table public.payment_intents (id uuid primary key default gen_random_uuid(), org_id uuid);
grant usage on schema public to authenticated, service_role;
`;

const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const USER = "20000000-0000-4000-8000-000000000001";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function as(who, sql, params) {
  await db.exec("begin");
  try {
    if (who === "user") {
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [USER]);
      await db.exec("set local role authenticated");
    } else {
      await db.exec("set local role service_role");
    }
    const rows = await q(sql, params);
    await db.exec("commit");
    return { ok: true, rows };
  } catch (err) {
    await db.exec("rollback");
    return { ok: false, code: err.code, message: err.message };
  }
}

let floorId;
let tableId;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent
  await db.exec(COUNTER);
  await db.exec(COUNTER); // idempotent
  await q(`insert into public.organizations (id) values ($1), ($2)`, [ORG, OTHER]);
  await q(`insert into public.org_members (org_id, user_id) values ($1, $2)`, [ORG, USER]);
  floorId = (await q(`insert into public.pos_floors (org_id, name) values ($1, 'Main Floor') returning id`, [ORG]))[0].id;
  tableId = (await q(`insert into public.pos_tables (org_id, floor_id, name, seats) values ($1, $2, '12', 4) returning id`, [ORG, floorId]))[0].id;
}, 60_000);

describe("restaurant schema", () => {
  it("accepts the restaurant business type and adds services.pos_station", async () => {
    await q(`update public.organizations set business_type = 'restaurant' where id = $1`, [ORG]);
    const cols = await q(`select column_name from information_schema.columns where table_name = 'services' and column_name = 'pos_station'`);
    expect(cols).toHaveLength(1);
    await expect(q(`update public.organizations set business_type = 'spaceship' where id = $1`, [ORG])).rejects.toThrow();
  });

  it("one table = one open order", async () => {
    await q(`insert into public.pos_tabs (org_id, table_id, order_number) values ($1, $2, 1001)`, [ORG, tableId]);
    await expect(q(`insert into public.pos_tabs (org_id, table_id, order_number) values ($1, $2, 1002)`, [ORG, tableId])).rejects.toThrow(
      /one_open_per_table/
    );
    // A closed tab frees the table.
    await q(`update public.pos_tabs set status = 'closed' where table_id = $1`, [tableId]);
    await q(`insert into public.pos_tabs (org_id, table_id, order_number) values ($1, $2, 1003)`, [ORG, tableId]);
  });

  it("order numbers are unique per organization; dine-in needs a table while open", async () => {
    await expect(q(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'takeaway', 1001)`, [ORG])).rejects.toThrow();
    await q(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'takeaway', 1001)`, [OTHER]);
    await expect(q(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'dine_in', 2001)`, [ORG])).rejects.toThrow(
      /pos_tabs_table_for_dine_in/
    );
  });

  it("guards table grid positions, seats and money columns", async () => {
    await expect(q(`insert into public.pos_tables (org_id, floor_id, name, pos_x) values ($1, $2, 'X', 40)`, [ORG, floorId])).rejects.toThrow();
    await expect(q(`insert into public.pos_tables (org_id, floor_id, name, seats) values ($1, $2, 'Y', 0)`, [ORG, floorId])).rejects.toThrow();
    const tab = (await q(`select id from public.pos_tabs where org_id = $1 and status = 'open' limit 1`, [ORG]))[0].id;
    await expect(q(`update public.pos_tabs set discount_amount = -1 where id = $1`, [tab])).rejects.toThrow();
    await expect(
      q(`insert into public.pos_tab_items (org_id, tab_id, name, quantity, unit_price) values ($1, $2, 'Bad', 0, 10)`, [ORG, tab])
    ).rejects.toThrow();
  });

  it("members read their own org; the browser cannot write (API / service role only)", async () => {
    const mine = await as("user", `select id from public.pos_tables`);
    expect(mine.ok).toBe(true);
    expect(mine.rows).toHaveLength(1);
    const otherFloor = (await q(`insert into public.pos_floors (org_id, name) values ($1, 'Theirs') returning id`, [OTHER]))[0].id;
    await q(`insert into public.pos_tables (org_id, floor_id, name) values ($1, $2, '1')`, [OTHER, otherFloor]);
    expect((await as("user", `select id from public.pos_tables`)).rows).toHaveLength(1);

    const write = await as("user", `insert into public.pos_floors (org_id, name) values ($1, 'Sneaky')`, [ORG]);
    expect(write.ok).toBe(false);
    const engine = await as("engine", `insert into public.pos_floors (org_id, name) values ($1, 'Patio')`, [ORG]);
    expect(engine.ok).toBe(true);
  });
});

describe("counter orders migration", () => {
  it("allows counter orders without a table and still rejects unknown order types", async () => {
    const org = (await db.query("select id from public.organizations limit 1")).rows[0]?.id;
    expect(org).toBeTruthy();
    await db.query(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'counter', 90001)`, [org]);
    await expect(db.query(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'drive_thru', 90002)`, [org])).rejects.toThrow(/order_type/);
    await expect(db.query(`insert into public.pos_tabs (org_id, order_type, order_number) values ($1, 'dine_in', 90003)`, [org])).rejects.toThrow(/pos_tabs_table_for_dine_in/);
  });
});
