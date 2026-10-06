/**
 * Purchase Order 2.0 — the complete lifecycle on the REAL schema (every migration replayed on PGlite),
 * as signed-in users through RLS, with the browser's own shared math for the financial views:
 *
 *   draft → edit → submit → approve (committed) → receive part → receive rest (payable)
 *   → pay part → pay rest (paid) → expense records → cash projection → cancel → audit trail
 *
 * Plus organisation isolation on every PO entry point (direct table access and every RPC), and the
 * audit trail's own access rules.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";
import {
  purchaseOrderFinancials,
  purchaseOrderPaymentSchedule,
  summarizePurchaseOrders,
  supplierOutflowWithin,
} from "../../shared/procurement/purchaseOrderMath.js";

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
  owner: "a3000000-0000-4000-8000-000000000001",
  manager: "a3000000-0000-4000-8000-000000000002",
  staff: "a3000000-0000-4000-8000-000000000003",
  cashier: "a3000000-0000-4000-8000-000000000004",
  rival: "f3000000-0000-4000-8000-000000000001",
};
const ORG = {};
const ROW = {};
let TODAY;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function signUp(id, email, orgName) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ org_name: orgName, plan: "business" }),
  ]);
  const org = (await one(`select id from public.organizations where owner_id = $1`, [id])).id;
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     values ($1, $2, $3, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly', now() + interval '30 days')`,
    [id, email, org]
  );
  return org;
}

async function invite(orgId, id, email, role, jobFunction) {
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

const save = (user, id, orgId, header, lines) =>
  as(user, `select * from public.save_purchase_order_draft($1, $2, $3::jsonb, $4::jsonb)`, [
    id,
    orgId,
    JSON.stringify(header),
    JSON.stringify(lines),
  ]);
const po = (id) => one(`select * from public.purchase_orders where id = $1`, [id]);
const lines = (id) => q(`select * from public.purchase_order_items where purchase_order_id = $1 order by sort_order`, [id]);
const events = (id) => q(`select action, actor_id, metadata from public.purchase_order_events where purchase_order_id = $1 order by created_at, action`, [id]);
const pay = (user, id, amount, extra = {}) =>
  as(user, `select * from public.record_purchase_order_payment($1, $2, $3::date, $4, $5, null, null, $6)`, [
    id,
    amount,
    extra.date ?? TODAY,
    extra.method ?? "eft",
    extra.reference ?? null,
    extra.op ?? null,
  ]);
const receive = (user, lineId, orgId, qty) =>
  as(user, `select * from public.receive_purchase_order_item($1, $2, $3, null)`, [lineId, orgId, qty]);
const setStatus = (user, id, status) => as(user, `update public.purchase_orders set status = $2 where id = $1`, [id, status]);

beforeAll(async () => {
  db = await replaySupabaseSchema();
  TODAY = (await one(`select current_date::text d`)).d;
  ORG.A = await signUp(U.owner, "owner@lifecycle.test", "Lifecycle Co");
  ORG.Z = await signUp(U.rival, "owner@rival.test", "Rival Co");
  await invite(ORG.A, U.manager, "manager@lifecycle.test", "manager", "general");
  await invite(ORG.A, U.staff, "staff@lifecycle.test", "employee", "sales");
  await invite(ORG.A, U.cashier, "till@lifecycle.test", "employee", "pos");
  ROW.product = (
    await one(
      `insert into public.services (org_id, name, default_unit, item_type, stock_quantity, cost_price)
       values ($1, 'Widget', 'unit', 'product', 0, 0) returning id`,
      [ORG.A]
    )
  ).id;
  ROW.supplier = (await one(`insert into public.suppliers (org_id, name, email) values ($1, 'Sup_test', 'orders@sup.test') returning id`, [ORG.A])).id;
  ROW.rivalSupplier = (await one(`insert into public.suppliers (org_id, name) values ($1, 'Rival supplier') returning id`, [ORG.Z])).id;
}, 120_000);

describe("lifecycle: draft → approved → received → paid", () => {
  it("1. creates a draft: decimals, discount, VAT, zero-VAT, long description and large quantity", async () => {
    const longText = "Heavy-duty galvanised steel shelving bracket with reinforced lip, zinc-plated, 450mm ".repeat(3).trim();
    const r = await save(U.manager, null, ORG.A, { supplier_id: ROW.supplier, order_date: TODAY, payment_terms_code: "net_30" }, [
      { product_id: ROW.product, quantity_ordered: 10, unit_cost: 600, vat_rate: 15 },
      { description: longText, quantity_ordered: 2500, unit_cost: 0.37, discount_percent: 2.5, vat_rate: 15 },
      { description: "Zero-rated basic foodstuff", quantity_ordered: 3, unit_cost: 99.99, vat_rate: 0 },
    ]);
    expect(r.ok).toBe(true);
    ROW.po = r.rows[0].id;
    const row = await po(ROW.po);
    // 6000 + 6900 VAT; 925.00 − 23.13 = 901.87, VAT 135.28; 299.97 → 7036.87 + … see totals below
    expect(row.status).toBe("draft");
    expect([row.subtotal, row.discount_total, row.vat_total, row.total_amount].map(Number)).toEqual([7224.97, 23.13, 1035.28, 8237.12]);
    expect((await lines(ROW.po))[1].description).toBe(longText);
  });

  it("2–3. edits and saves the draft (lines and terms replaced, totals recomputed)", async () => {
    const r = await save(U.owner, ROW.po, null, { supplier_id: ROW.supplier, order_date: TODAY, payment_terms_code: "net_15", notes: "Deliver to bay 3" }, [
      { product_id: ROW.product, quantity_ordered: 10, unit_cost: 1000, vat_rate: 0 },
    ]);
    expect(r.ok).toBe(true);
    const row = await po(ROW.po);
    expect(Number(row.total_amount)).toBe(10000);
    expect(row.payment_terms).toBe("15 days");
    expect(iso(row.due_date)).toBe(addDays(TODAY, 15));
    expect(await lines(ROW.po)).toHaveLength(1);
  });

  it("5. submits; a draft is not committed spend and cannot be paid or received", async () => {
    expect(purchaseOrderFinancials(await po(ROW.po)).committed).toBe(0);
    await ok(U.manager, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.po]);
    expect((await pay(U.owner, ROW.po, 1)).ok).toBe(false);
    const [line] = await lines(ROW.po);
    expect((await receive(U.owner, line.id, ORG.A, 1)).ok).toBe(false);
    expect(purchaseOrderFinancials(await po(ROW.po)).committed).toBe(0);
  });

  it("returning to draft records the reason; resubmitting works", async () => {
    await ok(U.owner, `select * from public.return_purchase_order_to_draft($1, $2)`, [ROW.po, "Use 30-day terms"]);
    expect((await po(ROW.po)).status).toBe("draft");
    await save(U.owner, ROW.po, null, { supplier_id: ROW.supplier, order_date: TODAY, payment_terms_code: "net_30" }, [
      { product_id: ROW.product, quantity_ordered: 10, unit_cost: 1000, vat_rate: 0 },
    ]);
    await ok(U.owner, `update public.purchase_orders set status = 'pending_approval' where id = $1`, [ROW.po]);
  });

  it("6–8. approves: committed spend R10,000, due order date + 30 days, locked", async () => {
    await ok(U.owner, `update public.purchase_orders set status = 'approved' where id = $1`, [ROW.po]);
    const row = await po(ROW.po);
    expect(iso(row.due_date)).toBe(addDays(TODAY, 30));
    expect(purchaseOrderFinancials(row)).toMatchObject({ committed: 10000, committedOpen: 10000, payableNow: 0, paid: 0, owed: 10000 });
    expect((await as(U.owner, `update public.purchase_orders set supplier_id = null where id = $1`, [ROW.po])).ok).toBe(false);
    expect((await as(U.owner, `update public.purchase_orders set due_date = $2 where id = $1`, [ROW.po, addDays(TODAY, 90)])).ok).toBe(false);
    expect((await as(U.owner, `update public.purchase_order_items set unit_cost = 1 where purchase_order_id = $1`, [ROW.po])).ok).toBe(false);
    expect((await q(`select count(*)::int n from public.expenses where purchase_order_id = $1`, [ROW.po]))[0].n).toBe(0);
  });

  it("9. cash projection: R10,000 expected on the due date, inside the 30-day window", async () => {
    const schedule = purchaseOrderPaymentSchedule([await po(ROW.po)], { now: new Date(`${TODAY}T12:00:00`) });
    expect(schedule).toEqual([expect.objectContaining({ date: addDays(TODAY, 30), amount: 10000, overdue: false })]);
    expect(supplierOutflowWithin(schedule, { now: new Date(`${TODAY}T12:00:00`), windowDays: 30 })).toBe(10000);
  });

  it("10–11. partial receipt: 6 of 10 received, 4 remaining, R6,000 payable — not paid", async () => {
    const [line] = await lines(ROW.po);
    expect((await receive(U.owner, line.id, ORG.A, 11)).ok).toBe(false); // over-receipt refused
    await ok(U.owner, `select * from public.receive_purchase_order_item($1, $2, 6, null)`, [line.id, ORG.A]);
    const [after] = await lines(ROW.po);
    expect([Number(after.quantity_ordered), Number(after.quantity_received)]).toEqual([10, 6]);
    expect(Number(after.quantity_ordered) - Number(after.quantity_received)).toBe(4);
    const row = await po(ROW.po);
    expect(row.status).toBe("partially_received");
    expect(purchaseOrderFinancials(row)).toMatchObject({ received: 6000, payableNow: 6000, committedOpen: 4000, paid: 0, paymentStatus: "unpaid" });
    expect((await receive(U.owner, line.id, ORG.A, 4.01)).ok).toBe(false);
  });

  it("12. receives the remaining 4", async () => {
    const [line] = await lines(ROW.po);
    await ok(U.owner, `select * from public.receive_purchase_order_item($1, $2, 4, null)`, [line.id, ORG.A]);
    const row = await po(ROW.po);
    expect(row.status).toBe("received");
    expect(purchaseOrderFinancials(row)).toMatchObject({ received: 10000, payableNow: 10000, owed: 10000, paid: 0 });
    expect(Number((await one(`select stock_quantity from public.services where id = $1`, [ROW.product])).stock_quantity)).toBe(10);
  });

  it("13–15. partial payment R4,000: outstanding R6,000, projection uses R6,000 (no double count)", async () => {
    const op = randomUUID();
    const r = await pay(U.manager, ROW.po, 4000, { method: "eft", reference: "EFT-001", op });
    expect(r.ok).toBe(true);
    ROW.pay1 = r.rows[0];
    const row = await po(ROW.po);
    expect(purchaseOrderFinancials(row)).toMatchObject({ paid: 4000, owed: 6000, payableNow: 6000, paymentStatus: "partially_paid" });
    const schedule = purchaseOrderPaymentSchedule([row], { now: new Date(`${TODAY}T12:00:00`) });
    expect(schedule.map((s) => s.amount)).toEqual([6000]);
    // Retried Save returns the same expense: no duplicate payment.
    const again = await pay(U.manager, ROW.po, 4000, { op });
    expect(again.rows[0].id).toBe(ROW.pay1.id);
    expect((await q(`select count(*)::int n from public.expenses where purchase_order_id = $1`, [ROW.po]))[0].n).toBe(1);
  });

  it("refuses paying more than the outstanding balance", async () => {
    const r = await pay(U.owner, ROW.po, 6000.01);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/6000\.00 still owed/);
  });

  it("16–19. final payment: paid in full, two linked expense records, nothing left to project", async () => {
    expect((await pay(U.owner, ROW.po, 6000, { method: "cash", date: TODAY })).ok).toBe(true);
    const row = await po(ROW.po);
    expect(purchaseOrderFinancials(row)).toMatchObject({ paid: 10000, owed: 0, paymentStatus: "paid" });
    expect(purchaseOrderPaymentSchedule([row])).toEqual([]);
    const expenses = await q(
      `select amount, payment_method, capture_source, supplier_id, purchase_order_id from public.expenses where purchase_order_id = $1 order by amount`,
      [ROW.po]
    );
    expect(expenses).toEqual([
      { amount: "4000.00", payment_method: "eft", capture_source: "purchase_order", supplier_id: ROW.supplier, purchase_order_id: ROW.po },
      { amount: "6000.00", payment_method: "cash", capture_source: "purchase_order", supplier_id: ROW.supplier, purchase_order_id: ROW.po },
    ]);
    expect((await pay(U.owner, ROW.po, 0.01)).ok).toBe(false);
  });

  it("accepts the expense form's payment methods", async () => {
    const r = await save(U.owner, null, ORG.A, { supplier_id: ROW.supplier, payment_terms_code: "due_on_receipt" }, [
      { description: "Card test", quantity_ordered: 1, unit_cost: 50 },
    ]);
    const id = r.rows[0].id;
    await setStatus(U.owner, id, "pending_approval");
    await setStatus(U.owner, id, "approved");
    for (const method of ["credit_card", "debit_card", "bank_transfer", "check"]) {
      expect((await pay(U.owner, id, 10, { method })).ok).toBe(true);
    }
    expect((await pay(U.owner, id, 1, { method: "bitcoin" })).ok).toBe(false);
  });

  it("22–23. cancelling an unreceived order removes it from projections and commitments", async () => {
    const r = await save(U.owner, null, ORG.A, { supplier_id: ROW.supplier, payment_terms_code: "net_7" }, [
      { description: "Cancelled order", quantity_ordered: 5, unit_cost: 200 },
    ]);
    ROW.cancel = r.rows[0].id;
    await setStatus(U.owner, ROW.cancel, "pending_approval");
    await setStatus(U.owner, ROW.cancel, "approved");
    expect(purchaseOrderPaymentSchedule([await po(ROW.cancel)])).toHaveLength(1);
    await ok(U.owner, `update public.purchase_orders set status = 'cancelled', cancellation_reason = 'Supplier out of stock' where id = $1`, [ROW.cancel]);
    const row = await po(ROW.cancel);
    expect(purchaseOrderPaymentSchedule([row])).toEqual([]);
    expect(summarizePurchaseOrders([row])).toMatchObject({ committed: 0, owed: 0, cancelled: 1000 });
  });
});

describe("audit trail", () => {
  it("records every step with its actor, in order", async () => {
    const ev = await events(ROW.po);
    const actions = ev.map((e) => e.action);
    for (const expected of [
      "created", "draft_saved", "submitted", "returned_to_draft", "approved",
      "goods_received", "fully_received", "payment_recorded",
    ]) {
      expect(actions).toContain(expected);
    }
    expect(ev.find((e) => e.action === "created").actor_id).toBe(U.manager);
    expect(ev.find((e) => e.action === "submitted").actor_id).toBe(U.manager);
    expect(ev.find((e) => e.action === "approved").actor_id).toBe(U.owner);
    expect(ev.find((e) => e.action === "returned_to_draft").metadata.reason).toBe("Use 30-day terms");
    const receipts = ev.filter((e) => e.action === "goods_received").map((e) => [e.metadata.quantity, e.metadata.remaining]);
    expect(receipts).toEqual([[6, 4], [4, 0]]);
    const payments = ev.filter((e) => e.action === "payment_recorded").map((e) => [Number(e.metadata.amount), Number(e.metadata.outstanding)]);
    expect(payments).toEqual([[4000, 6000], [6000, 0]]);
  });

  it("records cancellation with its reason, and sending to the supplier", async () => {
    expect((await events(ROW.cancel)).find((e) => e.action === "cancelled").metadata.reason).toBe("Supplier out of stock");
    await ok(U.owner, `update public.purchase_orders set sent_at = now(), sent_to_email = 'orders@sup.test' where id = $1`, [ROW.po]);
    expect((await events(ROW.po)).find((e) => e.action === "sent_to_supplier").metadata.email).toBe("orders@sup.test");
  });

  it("is append-only and readable only by the company's financial viewers", async () => {
    expect((await ok(U.owner, `select count(*)::int n from public.purchase_order_events where purchase_order_id = $1`, [ROW.po]))[0].n).toBeGreaterThan(5);
    expect((await ok(U.manager, `select count(*)::int n from public.purchase_order_events where purchase_order_id = $1`, [ROW.po]))[0].n).toBeGreaterThan(5);
    for (const user of [U.staff, U.cashier, U.rival]) {
      expect((await ok(user, `select count(*)::int n from public.purchase_order_events where purchase_order_id = $1`, [ROW.po]))[0].n).toBe(0);
    }
    expect((await as(U.owner, `insert into public.purchase_order_events (org_id, action) values ($1, 'forged')`, [ORG.A])).ok).toBe(false);
    expect((await as(U.owner, `delete from public.purchase_order_events where purchase_order_id = $1`, [ROW.po])).ok).toBe(false);
    expect((await as(U.owner, `update public.purchase_order_events set action = 'x' where purchase_order_id = $1`, [ROW.po])).ok).toBe(false);
    expect((await as(U.owner, `select public.purchase_order_log_event($1, null, 'PO-X', 'forged', null, null, '{}')`, [ORG.A])).ok).toBe(false);
  });
});

describe("organisation isolation and role permissions (direct API access)", () => {
  beforeAll(async () => {
    const r = await save(U.owner, null, ORG.A, { supplier_id: ROW.supplier, payment_terms_code: "net_30" }, [
      { product_id: ROW.product, quantity_ordered: 5, unit_cost: 100 },
    ]);
    ROW.open = r.rows[0].id;
    await setStatus(U.owner, ROW.open, "pending_approval");
    await setStatus(U.owner, ROW.open, "approved");
    ROW.openLine = (await lines(ROW.open))[0].id;
  });

  it("another company cannot read Company A's POs, lines, suppliers, payments or events", async () => {
    for (const [sql, param] of [
      [`select id from public.purchase_orders where id = $1`, ROW.open],
      [`select id from public.purchase_order_items where purchase_order_id = $1`, ROW.open],
      [`select id from public.suppliers where id = $1`, ROW.supplier],
      [`select id from public.expenses where purchase_order_id = $1`, ROW.po],
      [`select id from public.purchase_order_events where purchase_order_id = $1`, ROW.po],
    ]) {
      expect(await ok(U.rival, sql, [param])).toEqual([]);
    }
  });

  it("another company cannot change status, receive, pay, revise, return or edit Company A's PO", async () => {
    const before = await po(ROW.open);
    expect((await as(U.rival, `update public.purchase_orders set status = 'cancelled' where id = $1 returning id`, [ROW.open])).rows ?? []).toEqual([]);
    expect((await receive(U.rival, ROW.openLine, ORG.A, 1)).ok).toBe(false);
    expect((await receive(U.rival, ROW.openLine, ORG.Z, 1)).ok).toBe(false);
    expect((await pay(U.rival, ROW.open, 100)).ok).toBe(false);
    expect((await as(U.rival, `select * from public.revise_purchase_order($1)`, [ROW.open])).ok).toBe(false);
    expect((await as(U.rival, `select * from public.return_purchase_order_to_draft($1, 'x')`, [ROW.open])).ok).toBe(false);
    expect((await save(U.rival, ROW.open, null, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
    expect((await as(U.rival, `delete from public.purchase_orders where id = $1 returning id`, [ROW.open])).rows ?? []).toEqual([]);
    const after = await po(ROW.open);
    expect([after.status, after.received_amount, after.amount_paid, after.updated_at]).toEqual([
      before.status, before.received_amount, before.amount_paid, before.updated_at,
    ]);
  });

  it("another company cannot attach its supplier to Company A's draft, nor A's supplier to its own expense", async () => {
    const r = await save(U.owner, null, ORG.A, { supplier_id: ROW.rivalSupplier }, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Supplier does not belong/);
    const e = await as(U.rival, `insert into public.expenses (org_id, supplier_id, amount, description, created_by_id) values ($1, $2, 1, 'x', $3)`, [
      ORG.Z,
      ROW.supplier,
      U.rival,
    ]);
    expect(e.ok).toBe(false);
  });

  it("employees and POS cashiers cannot see, approve, receive or pay", async () => {
    for (const user of [U.staff, U.cashier]) {
      expect(await ok(user, `select id from public.purchase_orders where id = $1`, [ROW.open])).toEqual([]);
      expect((await receive(user, ROW.openLine, ORG.A, 1)).ok).toBe(false);
      expect((await pay(user, ROW.open, 1)).ok).toBe(false);
      expect((await save(user, null, ORG.A, {}, [{ description: "x", quantity_ordered: 1, unit_cost: 1 }])).ok).toBe(false);
    }
    expect(Number((await po(ROW.open)).received_amount)).toBe(0);
  });
});
