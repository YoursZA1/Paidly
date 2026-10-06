/**
 * Purchase order → commitment → receiving → supplier payment → expense, on the REAL schema (every
 * migration replayed on PGlite), as signed-in users through RLS.
 *
 * Approving commits spend but is never an expense; only a recorded supplier payment (an expenses row
 * linked by purchase_order_id) is. Totals are computed by the database, approved lines are frozen,
 * status moves only along the allowed path, and payments can never exceed what the PO owes.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params) => runAs(db, user, sql, params);
const ok = async (user, sql, params) => {
  const r = await as(user, sql, params);
  if (!r.ok) throw new Error(r.message);
  return r.rows;
};

const U = {
  ownerA: "a2000000-0000-4000-8000-000000000001",
  managerA: "a2000000-0000-4000-8000-000000000002",
  staffA: "a2000000-0000-4000-8000-000000000003",
  ownerZ: "f2000000-0000-4000-8000-000000000001",
};
const ORG = {};
const ROW = {};

async function signUp(id, email, orgName) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ org_name: orgName, plan: "business" }),
  ]);
  return (await one(`select id from public.organizations where owner_id = $1`, [id])).id;
}

async function inviteInto(orgId, id, email, role, jobFunction) {
  await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [
    id,
    email,
    JSON.stringify({ pending_company_invite: "true" }),
  ]);
  await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, $4)`, [
    orgId,
    id,
    role,
    jobFunction,
  ]);
}

async function activePlan(ownerId, orgId) {
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     select $1, u.email, $2, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly',
       now() + interval '30 days'
     from auth.users u where u.id = $1`,
    [ownerId, orgId]
  );
}

async function product(orgId, name) {
  return (
    await one(
      `insert into public.services (org_id, name, default_unit, item_type, stock_quantity, cost_price)
       values ($1, $2, 'unit', 'product', 0, 0) returning id`,
      [orgId, name]
    )
  ).id;
}

/** Draft PO as `user`, lines inserted the way EntityManager.create does. */
async function draftPo(user, orgId, number, lines, supplierId = null) {
  const [po] = await ok(
    user,
    `insert into public.purchase_orders (org_id, supplier_id, po_number, status) values ($1, $2, $3, 'draft') returning *`,
    [orgId, supplierId, number]
  );
  for (const [i, l] of lines.entries()) {
    await ok(
      user,
      `insert into public.purchase_order_items
         (purchase_order_id, org_id, product_id, description, quantity_ordered, unit_cost, discount_percent, vat_rate, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [po.id, orgId, l.product ?? null, l.description ?? null, l.qty, l.cost, l.discount ?? 0, l.vat ?? 0, i]
    );
  }
  return po.id;
}

const po = (id) => one(`select * from public.purchase_orders where id = $1`, [id]);
const items = (id) => q(`select * from public.purchase_order_items where purchase_order_id = $1 order by sort_order`, [id]);
const pay = (user, poId, amount, extra = {}) =>
  as(
    user,
    `select * from public.record_purchase_order_payment($1, $2, $3::date, $4, $5, $6, null, $7)`,
    [poId, amount, extra.date ?? new Date().toISOString().slice(0, 10), extra.method ?? "eft", extra.reference ?? null, extra.category ?? null, extra.op ?? null]
  );

beforeAll(async () => {
  db = await replaySupabaseSchema();
  ORG.A = await signUp(U.ownerA, "owner@a.test", "Company A");
  ORG.Z = await signUp(U.ownerZ, "owner@z.test", "Company Z");
  await inviteInto(ORG.A, U.managerA, "manager@a.test", "manager", "general");
  await inviteInto(ORG.A, U.staffA, "staff@a.test", "employee", "sales");
  await activePlan(U.ownerA, ORG.A);
  await activePlan(U.ownerZ, ORG.Z);

  ROW.productA = await product(ORG.A, "Product A");
  ROW.productB = await product(ORG.A, "Product B");
  ROW.productZ = await product(ORG.Z, "Rival widget");
  ROW.supplier = (
    await one(`insert into public.suppliers (org_id, name) values ($1, 'Sup_test') returning id`, [ORG.A])
  ).id;
}, 120_000);

describe("totals are computed by the database", () => {
  it("PO-1001: 10 × R100 + 5 × R200 = R2,000 order value", async () => {
    const id = await draftPo(U.ownerA, ORG.A, "PO-1001", [
      { product: ROW.productA, qty: 10, cost: 100 },
      { product: ROW.productB, qty: 5, cost: 200 },
    ], ROW.supplier);
    const row = await po(id);
    expect(Number(row.subtotal)).toBe(2000);
    expect(Number(row.vat_total)).toBe(0);
    expect(Number(row.total_amount)).toBe(2000);
    expect(row.status).toBe("draft");
    ROW.po1001 = id;
  });

  it("discount and VAT per line: gross − discount, then VAT on the net", async () => {
    const id = await draftPo(U.ownerA, ORG.A, "PO-VAT", [
      { product: ROW.productA, qty: 3, cost: 33.33, discount: 10, vat: 15 },
      { description: "Delivery fee", qty: 1, cost: 150, vat: 15 },
    ], ROW.supplier);
    const [a, b] = await items(id);
    // 3 × 33.33 = 99.99; discount 10.00; net 89.99; VAT 13.50 (13.4985); total 103.49
    expect([a.line_subtotal, a.line_discount, a.line_vat, a.line_total].map(Number)).toEqual([99.99, 10, 13.5, 103.49]);
    expect([b.line_subtotal, b.line_vat, b.line_total].map(Number)).toEqual([150, 22.5, 172.5]);
    const row = await po(id);
    expect([row.subtotal, row.discount_total, row.vat_total, row.total_amount].map(Number)).toEqual([249.99, 10, 36, 275.99]);
    ROW.poVat = id;
  });

  it("a client cannot write money columns or a non-draft status on insert", async () => {
    const forged = await as(
      U.ownerA,
      `insert into public.purchase_orders (org_id, po_number, status, total_amount, amount_paid) values ($1, 'PO-X', 'approved', 1, 1)`,
      [ORG.A]
    );
    expect(forged.ok).toBe(false);
    const [row] = await ok(
      U.ownerA,
      `insert into public.purchase_orders (org_id, po_number, status, total_amount, amount_paid, received_amount)
       values ($1, 'PO-FORGE', 'draft', 999999, 999999, 999999) returning total_amount, amount_paid, received_amount`,
      [ORG.A]
    );
    expect(Object.values(row).map(Number)).toEqual([0, 0, 0]);
  });

  it("a client update cannot change totals, amount paid or the PO number", async () => {
    await ok(
      U.ownerA,
      `update public.purchase_orders set total_amount = 1, amount_paid = 2000, po_number = 'PO-9' where id = $1`,
      [ROW.po1001]
    );
    const row = await po(ROW.po1001);
    expect([Number(row.total_amount), Number(row.amount_paid), row.po_number]).toEqual([2000, 0, "PO-1001"]);
  });
});

describe("company isolation", () => {
  it("another company cannot attach a line to company A's purchase order", async () => {
    const r = await as(
      U.ownerZ,
      `insert into public.purchase_order_items (purchase_order_id, org_id, product_id, quantity_ordered, unit_cost)
       values ($1, $2, $3, 1000, 1000)`,
      [ROW.po1001, ORG.Z, ROW.productZ]
    );
    expect(r.ok).toBe(false);
    expect(Number((await po(ROW.po1001)).total_amount)).toBe(2000);
  });

  it("a product from another company cannot be ordered", async () => {
    const r = await as(
      U.ownerA,
      `insert into public.purchase_order_items (purchase_order_id, org_id, product_id, quantity_ordered, unit_cost)
       values ($1, $2, $3, 1, 1)`,
      [ROW.po1001, ORG.A, ROW.productZ]
    );
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/does not belong/);
  });

  it("employees cannot see purchase orders; another company cannot either", async () => {
    expect(await ok(U.staffA, `select id from public.purchase_orders where id = $1`, [ROW.po1001])).toEqual([]);
    expect(await ok(U.ownerZ, `select id from public.purchase_orders where id = $1`, [ROW.po1001])).toEqual([]);
  });
});

describe("approval = commitment, never an expense", () => {
  it("a draft cannot be paid", async () => {
    const r = await pay(U.ownerA, ROW.po1001, 100);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Approve the purchase order/);
  });

  it("an empty draft cannot be submitted, and a draft cannot skip submission", async () => {
    const r = await as(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where po_number = 'PO-FORGE'`);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/at least one line/);
    const skip = await as(U.ownerA, `update public.purchase_orders set status = 'approved' where id = $1`, [ROW.po1001]);
    expect(skip.ok).toBe(false);
    expect(skip.message).toMatch(/Submit the purchase order for approval/);
  });

  it("a draft cannot jump straight to received", async () => {
    const r = await as(U.ownerA, `update public.purchase_orders set status = 'received' where id = $1`, [ROW.po1001]);
    expect(r.ok).toBe(false);
  });

  it("approving stamps who and when, and creates no expense", async () => {
    await ok(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.po1001]);
    expect((await po(ROW.po1001)).submitted_by).toBe(U.ownerA);
    expect((await pay(U.ownerA, ROW.po1001, 1)).ok).toBe(false);
    await ok(U.managerA, `update public.purchase_orders set status = 'approved' where id = $1`, [ROW.po1001]);
    const row = await po(ROW.po1001);
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(U.managerA);
    expect(row.approved_at).not.toBeNull();
    expect(await q(`select id from public.expenses where purchase_order_id = $1`, [ROW.po1001])).toEqual([]);
  });

  it("approved lines are frozen: no price change, no new line, no removal", async () => {
    const [line] = await items(ROW.po1001);
    expect((await as(U.ownerA, `update public.purchase_order_items set unit_cost = 1 where id = $1`, [line.id])).ok).toBe(false);
    expect((await as(U.ownerA, `delete from public.purchase_order_items where id = $1`, [line.id])).ok).toBe(false);
    expect(
      (
        await as(
          U.ownerA,
          `insert into public.purchase_order_items (purchase_order_id, org_id, description, quantity_ordered, unit_cost)
           values ($1, $2, 'Extra', 1, 1)`,
          [ROW.po1001, ORG.A]
        )
      ).ok
    ).toBe(false);
    expect((await as(U.ownerA, `update public.purchase_orders set supplier_id = null where id = $1`, [ROW.po1001])).ok).toBe(false);
    expect(Number((await po(ROW.po1001)).total_amount)).toBe(2000);
  });

  it("a client cannot fake a receipt by writing quantity_received", async () => {
    const [line] = await items(ROW.po1001);
    await ok(U.ownerA, `update public.purchase_order_items set quantity_received = 10 where id = $1`, [line.id]);
    expect(Number((await items(ROW.po1001))[0].quantity_received)).toBe(0);
    expect(Number((await po(ROW.po1001)).received_amount)).toBe(0);
  });
});

describe("receiving", () => {
  it("a partial receipt moves the PO to partially_received and values what arrived", async () => {
    const [lineA] = await items(ROW.po1001);
    await ok(U.ownerA, `select * from public.receive_purchase_order_item($1, $2, 4, null)`, [lineA.id, ORG.A]);
    const row = await po(ROW.po1001);
    expect(row.status).toBe("partially_received");
    expect(Number(row.received_amount)).toBe(400);
    expect(row.last_received_at).not.toBeNull();
    const stock = await one(`select stock_quantity, cost_price from public.services where id = $1`, [ROW.productA]);
    expect([Number(stock.stock_quantity), Number(stock.cost_price)]).toEqual([4, 100]);
  });

  it("receiving the rest marks it received", async () => {
    const [lineA, lineB] = await items(ROW.po1001);
    await ok(U.ownerA, `select * from public.receive_purchase_order_item($1, $2, 6, null)`, [lineA.id, ORG.A]);
    await ok(U.ownerA, `select * from public.receive_purchase_order_item($1, $2, 5, null)`, [lineB.id, ORG.A]);
    const row = await po(ROW.po1001);
    expect(row.status).toBe("received");
    expect(Number(row.received_amount)).toBe(2000);
    expect(row.received_at).not.toBeNull();
  });

  it("a free-text line is received without touching stock", async () => {
    await ok(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.poVat]);
    await ok(U.ownerA, `update public.purchase_orders set status = 'approved' where id = $1`, [ROW.poVat]);
    const [, fee] = await items(ROW.poVat);
    const r = await ok(U.ownerA, `select * from public.receive_purchase_order_item($1, $2, 1, null)`, [fee.id, ORG.A]);
    expect(r[0].new_stock).toBeNull();
    const row = await po(ROW.poVat);
    expect(row.status).toBe("partially_received");
    expect(Number(row.received_amount)).toBe(172.5);
  });
});

describe("supplier payment → expense", () => {
  it("Received R2,000 · Paid R0 · Outstanding R2,000 until a payment is recorded", async () => {
    const row = await po(ROW.po1001);
    expect([Number(row.total_amount), Number(row.received_amount), Number(row.amount_paid)]).toEqual([2000, 2000, 0]);
  });

  it("employees cannot record a supplier payment", async () => {
    const r = await pay(U.staffA, ROW.po1001, 500);
    expect(r.ok).toBe(false);
    const direct = await as(
      U.staffA,
      `insert into public.expenses (org_id, purchase_order_id, amount, description, created_by_id)
       values ($1, $2, 500, 'sneaky', $3)`,
      [ORG.A, ROW.po1001, U.staffA]
    );
    expect(direct.ok).toBe(false);
    expect(Number((await po(ROW.po1001)).amount_paid)).toBe(0);
  });

  it("another company cannot link its expense to company A's PO", async () => {
    const r = await as(
      U.ownerZ,
      `insert into public.expenses (org_id, purchase_order_id, amount, description, created_by_id)
       values ($1, $2, 2000, 'cross-tenant', $3)`,
      [ORG.Z, ROW.po1001, U.ownerZ]
    );
    expect(r.ok).toBe(false);
    expect(Number((await po(ROW.po1001)).amount_paid)).toBe(0);
  });

  it("records an expense sourced from the PO and updates amount paid", async () => {
    const op = randomUUID();
    const [exp] = (await pay(U.managerA, ROW.po1001, 1500, { reference: "EFT-778", method: "eft", op })).rows;
    expect(exp).toMatchObject({
      purchase_order_id: ROW.po1001,
      supplier_id: ROW.supplier,
      vendor: "Sup_test",
      category: "inventory",
      capture_source: "purchase_order",
      payment_method: "eft",
      payment_reference: "EFT-778",
      description: "Payment for PO-1001 — Sup_test",
    });
    expect(Number(exp.amount)).toBe(1500);
    expect(Number((await po(ROW.po1001)).amount_paid)).toBe(1500);

    // Retried Save returns the same expense.
    const [again] = (await pay(U.managerA, ROW.po1001, 1500, { op })).rows;
    expect(again.id).toBe(exp.id);
    expect(Number((await po(ROW.po1001)).amount_paid)).toBe(1500);
    ROW.payment = exp.id;
  });

  it("refuses a payment above what is still owed", async () => {
    const r = await pay(U.ownerA, ROW.po1001, 500.01);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/500\.00 still owed on PO-1001/);
    const raised = await as(U.ownerA, `update public.expenses set amount = 2500 where id = $1`, [ROW.payment]);
    expect(raised.ok).toBe(false);
  });

  it("splits VAT proportionally on a VAT-registered order", async () => {
    const [exp] = (await pay(U.ownerA, ROW.poVat, 100)).rows;
    // 100 × 36 / 275.99 = 13.04
    expect([Number(exp.vat), Number(exp.subtotal)]).toEqual([13.04, 86.96]);
  });

  it("deleting a payment puts the amount back on the PO", async () => {
    await ok(U.ownerA, `delete from public.expenses where id = $1`, [ROW.payment]);
    expect(Number((await po(ROW.po1001)).amount_paid)).toBe(0);
  });

  it("a cancelled PO owes only what was received", async () => {
    await ok(U.ownerA, `update public.purchase_orders set status = 'cancelled' where id = $1`, [ROW.poVat]);
    const row = await po(ROW.poVat);
    expect(row.cancelled_at).not.toBeNull();
    // Received 172.50, already paid 100.
    expect((await pay(U.ownerA, ROW.poVat, 72.51)).ok).toBe(false);
    expect((await pay(U.ownerA, ROW.poVat, 72.5)).ok).toBe(true);
    expect(Number((await po(ROW.poVat)).amount_paid)).toBe(172.5);
  });

  it("only drafts or untouched cancelled POs can be deleted", async () => {
    expect((await as(U.ownerA, `delete from public.purchase_orders where id = $1`, [ROW.po1001])).ok).toBe(false);
    expect((await as(U.ownerA, `delete from public.purchase_orders where id = $1`, [ROW.poVat])).ok).toBe(false);
    const r = await as(U.ownerA, `delete from public.purchase_orders where po_number = 'PO-FORGE' returning id`);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
  });
});

const save = (user, id, orgId, header, lines) =>
  as(user, `select * from public.save_purchase_order_draft($1, $2, $3::jsonb, $4::jsonb)`, [
    id,
    orgId,
    JSON.stringify(header),
    JSON.stringify(lines),
  ]);

describe("draft editing, approval workflow and payment terms", () => {
  beforeAll(async () => {
    // Earlier tests hand-numbered PO-1001; start the real counter clear of them.
    await q(
      `insert into public.org_document_counters (org_id, doc_type, last_number) values ($1, 'purchase_order', 5000)
       on conflict (org_id, doc_type) do update set last_number = 5000`,
      [ORG.A]
    );
  });

  it("creates a draft atomically with a PO number, net-30 due date and computed totals", async () => {
    const r = await save(U.ownerA, null, ORG.A, { supplier_id: ROW.supplier, order_date: "2026-10-06", payment_terms_code: "net_30" }, [
      { product_id: ROW.productA, quantity_ordered: 10, unit_cost: 1000, vat_rate: 0 },
    ]);
    expect(r.ok).toBe(true);
    const [row] = r.rows;
    expect(row).toMatchObject({ status: "draft", payment_terms_code: "net_30", payment_terms: "30 days" });
    expect(row.po_number).toMatch(/^PO-\d+$/);
    expect(String(row.due_date.toISOString?.() ?? row.due_date).slice(0, 10)).toBe("2026-11-05");
    expect(Number(row.total_amount)).toBe(10000);
    ROW.draft = row.id;
  });

  it("refuses a draft with no lines or a line with no quantity, and saves nothing", async () => {
    expect((await save(U.ownerA, null, ORG.A, {}, [])).ok).toBe(false);
    const bad = await save(U.ownerA, null, ORG.A, {}, [{ description: "x", quantity_ordered: 0, unit_cost: 1 }]);
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/quantity above zero/);
  });

  it("edits a draft: header and lines replaced together, due date recomputed", async () => {
    const r = await save(U.managerA, ROW.draft, null, { supplier_id: ROW.supplier, order_date: "2026-10-06", payment_terms_code: "net_7", notes: "Rush" }, [
      { product_id: ROW.productA, quantity_ordered: 2, unit_cost: 500, vat_rate: 15 },
      { description: "Pallet hire", quantity_ordered: 1, unit_cost: 100, vat_rate: 15 },
    ]);
    expect(r.ok).toBe(true);
    const row = await po(ROW.draft);
    expect(row.notes).toBe("Rush");
    expect(row.payment_terms).toBe("7 days");
    expect(row.due_date.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(Number(row.total_amount)).toBe(1265);
    expect(await items(ROW.draft)).toHaveLength(2);
  });

  it("custom terms keep the entered due date; due before the order date is refused", async () => {
    const r = await save(U.ownerA, ROW.draft, null, { supplier_id: ROW.supplier, order_date: "2026-10-06", payment_terms_code: "custom", due_date: "2026-12-01" }, [
      { product_id: ROW.productA, quantity_ordered: 2, unit_cost: 500, vat_rate: 15 },
    ]);
    expect(r.ok).toBe(true);
    expect((await po(ROW.draft)).due_date.toISOString().slice(0, 10)).toBe("2026-12-01");
    const early = await save(U.ownerA, ROW.draft, null, { order_date: "2026-10-06", payment_terms_code: "custom", due_date: "2026-10-01" }, [
      { product_id: ROW.productA, quantity_ordered: 2, unit_cost: 500 },
    ]);
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/before the order date/);
  });

  it("employees and other companies cannot save drafts", async () => {
    expect((await save(U.staffA, ROW.draft, null, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
    expect((await save(U.ownerZ, ROW.draft, null, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
    expect((await save(U.ownerZ, null, ORG.A, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
  });

  it("submitted: lines, terms and due date lock; return to draft unlocks", async () => {
    await ok(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.draft]);
    expect((await save(U.ownerA, ROW.draft, null, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
    expect((await as(U.ownerA, `update public.purchase_orders set payment_terms_code = 'net_15' where id = $1`, [ROW.draft])).ok).toBe(false);
    expect((await as(U.ownerA, `update public.purchase_orders set due_date = '2027-01-01' where id = $1`, [ROW.draft])).ok).toBe(false);
    // Operational fields stay editable.
    await ok(U.ownerA, `update public.purchase_orders set expected_date = '2026-10-20' where id = $1`, [ROW.draft]);

    await ok(U.ownerA, `update public.purchase_orders set status = 'draft' where id = $1`, [ROW.draft]);
    const back = await po(ROW.draft);
    expect([back.status, back.submitted_at]).toEqual(["draft", null]);
    expect((await save(U.ownerA, ROW.draft, null, { supplier_id: ROW.supplier, order_date: "2026-10-06", payment_terms_code: "due_on_receipt", expected_date: "2026-10-20" }, [
      { product_id: ROW.productA, quantity_ordered: 4, unit_cost: 250 },
    ])).ok).toBe(true);
    expect((await po(ROW.draft)).due_date.toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  it("due on receipt: the due date becomes the actual first receipt date", async () => {
    await ok(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.draft]);
    await ok(U.ownerA, `update public.purchase_orders set status = 'approved' where id = $1`, [ROW.draft]);
    const [line] = await items(ROW.draft);
    await ok(U.ownerA, `select * from public.receive_purchase_order_item($1, $2, 1, null)`, [line.id, ORG.A]);
    const today = (await one(`select current_date::text d`)).d;
    expect((await po(ROW.draft)).due_date.toISOString().slice(0, 10)).toBe(today);
  });

  it("revise: an approved, untouched PO is cancelled and copied into a linked draft", async () => {
    const r = await save(U.ownerA, null, ORG.A, { supplier_id: ROW.supplier, payment_terms_code: "net_15" }, [
      { description: "Uniforms", quantity_ordered: 12, unit_cost: 300, vat_rate: 15 },
    ]);
    const orig = r.rows[0].id;
    expect((await as(U.ownerA, `select * from public.revise_purchase_order($1)`, [orig])).ok).toBe(false); // still a draft
    await ok(U.ownerA, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [orig]);
    await ok(U.ownerA, `update public.purchase_orders set status = 'approved' where id = $1`, [orig]);

    const [rev] = await ok(U.managerA, `select * from public.revise_purchase_order($1)`, [orig]);
    expect(rev).toMatchObject({ status: "draft", revises_purchase_order_id: orig, payment_terms_code: "net_15" });
    expect(Number(rev.total_amount)).toBe(4140);
    const old = await po(orig);
    expect(old.status).toBe("cancelled");
    expect(old.cancellation_reason).toBe(`Revised as ${rev.po_number}`);
    expect(await items(rev.id)).toHaveLength(1);
  });

  it("revise is refused once goods are received or paid", async () => {
    // ROW.draft is approved and partly received above.
    const r = await as(U.ownerA, `select * from public.revise_purchase_order($1)`, [ROW.draft]);
    expect(r.ok).toBe(false);
  });
});
