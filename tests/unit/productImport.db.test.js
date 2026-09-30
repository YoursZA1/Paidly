/**
 * Product Import on the REAL schema (every migration replayed on PGlite), as signed-in users through RLS.
 *
 * catalog_import_matches() only ever returns the asked-for company's rows, and only what the caller may
 * see — passing another company's id returns nothing. import_ref makes retried inserts no-ops. The
 * existing services RLS + plan trigger still govern imported writes (POS cashiers and Starter plans
 * cannot create products; anon cannot call the lookup).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params) => runAs(db, user, sql, params);

const U = {
  ownerA: "a2000000-0000-4000-8000-000000000001",
  managerA: "a2000000-0000-4000-8000-000000000002",
  cashierA: "b2000000-0000-4000-8000-000000000001",
  ownerB: "f2000000-0000-4000-8000-000000000001",
  ownerS: "e2000000-0000-4000-8000-000000000001",
};
const ORG = {};
const IMPORT = "44444444-4444-4444-8444-444444444444";

async function signUp(id, email, orgName, plan = "business") {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ org_name: orgName, plan })]);
  return (await one(`select id from public.organizations where owner_id = $1`, [id])).id;
}

async function inviteInto(orgId, id, email, role, jobFunction) {
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [
    id,
    email,
    JSON.stringify({ pending_company_invite: "true" }),
  ]);
  await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, $4)`, [orgId, id, role, jobFunction]);
}

async function activePlan(ownerId, orgId, family) {
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     select $1, u.email, $2, $1, 'active', $3, $3, $3 || '_monthly', $3, 0, 'ZAR', 'monthly', now() + interval '30 days'
     from auth.users u where u.id = $1`,
    [ownerId, orgId, family]
  );
}

const insertProduct = (user, org, name, extra = {}) =>
  as(
    user,
    `insert into public.services (org_id, name, item_type, default_unit, sku, barcode, import_ref, stock_quantity)
     values ($1, $2, 'product', 'unit', $3, $4, $5, 0)
     on conflict (org_id, import_ref) do nothing
     returning id`,
    [org, name, extra.sku ?? null, extra.barcode ?? null, extra.import_ref ?? null]
  );

const matches = (user, org, { skus = [], barcodes = [], names = [] }) =>
  as(user, `select * from public.catalog_import_matches($1, $2, $3, $4)`, [org, skus, barcodes, names]);

beforeAll(async () => {
  db = await replaySupabaseSchema();
  ORG.A = await signUp(U.ownerA, "owner@a.test", "Spaza A");
  ORG.B = await signUp(U.ownerB, "owner@b.test", "Spaza B");
  ORG.S = await signUp(U.ownerS, "owner@s.test", "Starter Co", "starter");
  await inviteInto(ORG.A, U.managerA, "manager@a.test", "manager", "general");
  await inviteInto(ORG.A, U.cashierA, "till@a.test", "employee", "pos");
  await activePlan(U.ownerA, ORG.A, "growth");
  await activePlan(U.ownerB, ORG.B, "growth");
  await q(`update public.subscriptions set status = 'cancelled', current_period_end = now() - interval '1 day' where company_id = $1`, [ORG.S]);
  await activePlan(U.ownerS, ORG.S, "starter");

  for (const [user, org, name, extra] of [
    [U.ownerA, ORG.A, "Coca Cola 330ml", { sku: "COKE330", barcode: "5449000000996" }],
    [U.ownerB, ORG.B, "Coffee Beans 1kg", { sku: "COF001", barcode: "6001234567892" }],
  ]) {
    const r = await insertProduct(user, org, name, extra);
    if (!r.ok) throw new Error(`seed ${name}: ${r.message}`);
  }
}, 120_000);

describe("catalog_import_matches", () => {
  it("finds the company's own items by SKU, barcode and name, ignoring case and spacing", async () => {
    const bySku = await matches(U.ownerA, ORG.A, { skus: [" coke330 "] });
    expect(bySku.rows.map((r) => r.name)).toEqual(["Coca Cola 330ml"]);
    const byBarcode = await matches(U.ownerA, ORG.A, { barcodes: ["5449000000996"] });
    expect(byBarcode.rows).toHaveLength(1);
    const byName = await matches(U.ownerA, ORG.A, { names: ["  coca   COLA 330ML"] });
    expect(byName.rows).toHaveLength(1);
    expect(byName.rows[0]).toMatchObject({ sku: "COKE330", item_type: "product", is_active: true });
  });

  it("never returns another company's products — not even when their company id is passed", async () => {
    const own = await matches(U.ownerA, ORG.A, { skus: ["COF001"], barcodes: ["6001234567892"], names: ["Coffee Beans 1kg"] });
    expect(own.rows).toEqual([]);
    const spoofed = await matches(U.ownerA, ORG.B, { skus: ["COF001"], barcodes: ["6001234567892"], names: ["Coffee Beans 1kg"] });
    expect(spoofed.ok).toBe(true);
    expect(spoofed.rows).toEqual([]);
  });

  it("anonymous callers can't run it", async () => {
    const r = await matches(null, ORG.A, { skus: ["COKE330"] });
    expect(r.ok === false || r.rows.length === 0).toBe(true);
  });

  it("a null company id matches nothing", async () => {
    const r = await matches(U.ownerA, null, { skus: ["COKE330"] });
    expect(r.rows).toEqual([]);
  });
});

describe("import_ref idempotency", () => {
  it("the same import row can't be created twice in one company", async () => {
    const ref = `${IMPORT}:2`;
    const first = await insertProduct(U.ownerA, ORG.A, "Maize Meal 5kg", { import_ref: ref });
    const retry = await insertProduct(U.ownerA, ORG.A, "Maize Meal 5kg", { import_ref: ref });
    expect(first.rows).toHaveLength(1);
    expect(retry.ok).toBe(true);
    expect(retry.rows).toHaveLength(0);
    expect((await one(`select count(*)::int as n from public.services where org_id = $1 and import_ref = $2`, [ORG.A, ref])).n).toBe(1);
  });

  it("the same import ref in another company is independent", async () => {
    const r = await insertProduct(U.ownerB, ORG.B, "Maize Meal 5kg", { import_ref: `${IMPORT}:2` });
    expect(r.rows).toHaveLength(1);
  });

  it("ordinary catalogue rows (no import_ref) are unaffected", async () => {
    expect((await insertProduct(U.ownerA, ORG.A, "Manual 1")).ok).toBe(true);
    expect((await insertProduct(U.ownerA, ORG.A, "Manual 2")).ok).toBe(true);
  });
});

describe("imported writes stay under the existing rules", () => {
  it("a user can't import into another company", async () => {
    const r = await insertProduct(U.ownerA, ORG.B, "Sneaky", { import_ref: `${IMPORT}:9` });
    expect(r.ok).toBe(false);
  });

  it("POS cashiers can't create catalogue items", async () => {
    const r = await insertProduct(U.cashierA, ORG.A, "Till import", { import_ref: `${IMPORT}:10` });
    expect(r.ok).toBe(false);
  });

  it("a Starter company can't create stock-tracked products (plan trigger)", async () => {
    const r = await insertProduct(U.ownerS, ORG.S, "Starter product", { import_ref: `${IMPORT}:11` });
    expect(r.ok).toBe(false);
  });

  it("active products in one company still can't share a barcode", async () => {
    const r = await insertProduct(U.ownerA, ORG.A, "Coke clone", { barcode: "5449000000996", import_ref: `${IMPORT}:12` });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("23505");
  });

  it("opening stock goes through the ledger for an imported product", async () => {
    const created = await insertProduct(U.ownerA, ORG.A, "Sugar 2kg", { import_ref: `${IMPORT}:13` });
    const id = created.rows[0].id;
    const r = await as(U.ownerA, `select * from public.adjust_inventory_stock($1, $2, 12, 'in', 'initial_stock', null)`, [id, ORG.A]);
    expect(r.ok).toBe(true);
    const row = await one(`select stock_quantity from public.services where id = $1`, [id]);
    expect(Number(row.stock_quantity)).toBe(12);
    const mv = await one(`select quantity, type, source from public.inventory_movements where product_id = $1`, [id]);
    expect(mv).toMatchObject({ type: "in", source: "initial_stock" });
    expect(Number(mv.quantity)).toBe(12);
  });
});
