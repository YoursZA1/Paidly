/**
 * Scan Receipt on the REAL schema (every migration replayed on PGlite), as signed-in users through RLS.
 *
 * Receipts bucket: company A's receipts are invisible to company Z; staff see only their own uploads;
 * owners/managers see the company's; POS cashiers get nothing; uploads need the expenses plan feature;
 * a receipt attached to an expense cannot be deleted. Expenses: receipt_path must sit in the expense's
 * own company folder, a supplier from another company is refused, confirm is idempotent.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const U = {
  ownerA: "a1000000-0000-4000-8000-000000000001",
  managerA: "a1000000-0000-4000-8000-000000000002",
  staffA: "a1000000-0000-4000-8000-000000000003",
  staffA2: "a1000000-0000-4000-8000-000000000004",
  cashierA: "b1000000-0000-4000-8000-000000000001",
  ownerZ: "f1000000-0000-4000-8000-000000000001",
  ownerS: "e1000000-0000-4000-8000-000000000001",
};
const ORG = {};

async function signUp(id, email, orgName, plan = "business") {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ org_name: orgName, plan }),
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

async function activePlan(ownerId, orgId, family) {
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     select $1, u.email, $2, $1, 'active', $3, $3, $3 || '_monthly', $3, 0, 'ZAR', 'monthly', now() + interval '30 days'
     from auth.users u where u.id = $1`,
    [ownerId, orgId, family]
  );
}

const as = (user, sql, params) => runAs(db, user, sql, params);
const receiptPath = (org, uploader, ext = "jpg") => `${org}/receipts/${uploader}/${randomUUID()}.${ext}`;
const upload = (user, name) =>
  as(user, `insert into storage.objects (bucket_id, name, owner) values ('receipts', $1, $2) returning name`, [name, user]);
const visible = async (user, names) => {
  const r = await as(user, `select name from storage.objects where bucket_id = 'receipts' and name = any($1)`, [names]);
  // anon has no table grant at all — also a denial.
  if (!r.ok && !user && /permission denied/.test(r.message)) return [];
  if (!r.ok) throw new Error(r.message);
  return r.rows.map((row) => row.name).sort();
};

let staffReceipt;
let staff2Receipt;
let legacyReceipt;

beforeAll(async () => {
  db = await replaySupabaseSchema();
  // Supabase grants the API roles table access on storage.objects; RLS is what decides.
  await q(`grant select, insert, update, delete on storage.objects to authenticated`);

  ORG.A = await signUp(U.ownerA, "owner@a.test", "Company A");
  ORG.Z = await signUp(U.ownerZ, "owner@z.test", "Company Z");
  ORG.S = await signUp(U.ownerS, "owner@s.test", "Starter Co", "starter");
  await inviteInto(ORG.A, U.managerA, "manager@a.test", "manager", "general");
  await inviteInto(ORG.A, U.staffA, "staff@a.test", "employee", "sales");
  await inviteInto(ORG.A, U.staffA2, "staff2@a.test", "employee", "operations");
  await inviteInto(ORG.A, U.cashierA, "till@a.test", "employee", "pos");
  await activePlan(U.ownerA, ORG.A, "growth");
  await activePlan(U.ownerZ, ORG.Z, "growth");
  await q(`update public.subscriptions set status = 'cancelled', current_period_end = now() - interval '1 day' where company_id = $1`, [ORG.S]);
  await activePlan(U.ownerS, ORG.S, "starter");

  staffReceipt = receiptPath(ORG.A, U.staffA);
  staff2Receipt = receiptPath(ORG.A, U.staffA2, "pdf");
  legacyReceipt = `${ORG.A}/receipt-1700000000000.jpg`;
  for (const [user, name] of [
    [U.staffA, staffReceipt],
    [U.staffA2, staff2Receipt],
  ]) {
    const r = await upload(user, name);
    if (!r.ok) throw new Error(`seed upload ${name}: ${r.message}`);
  }
  // Legacy object written before this migration (service role).
  await q(`insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [legacyReceipt]);
}, 120_000);

describe("receipts bucket — uploads", () => {
  it("staff can upload only into their own folder of their own company", async () => {
    expect((await upload(U.staffA, receiptPath(ORG.A, U.staffA))).ok).toBe(true);
    expect((await upload(U.staffA, receiptPath(ORG.A, U.managerA))).ok).toBe(false);
  });

  it("a user from another company cannot upload into company A (manipulated company id)", async () => {
    expect((await upload(U.ownerZ, receiptPath(ORG.A, U.ownerZ))).ok).toBe(false);
    expect((await upload(U.ownerZ, receiptPath(ORG.Z, U.ownerZ))).ok).toBe(true);
  });

  it("POS cashiers cannot upload receipts", async () => {
    expect((await upload(U.cashierA, receiptPath(ORG.A, U.cashierA))).ok).toBe(false);
  });

  it("unauthenticated uploads fail", async () => {
    expect((await upload(null, receiptPath(ORG.A, U.staffA))).ok).toBe(false);
  });

  it("legacy / malformed paths are refused", async () => {
    for (const name of [`${ORG.A}/receipt-1.jpg`, `${ORG.A}/receipts/${U.staffA}/../x.jpg`, `not-a-uuid/receipts/${U.staffA}/x.jpg`]) {
      expect((await upload(U.ownerA, name)).ok).toBe(false);
    }
  });

  it("a company without the expenses feature cannot upload", async () => {
    const plan = await one(`select * from public.paidly_company_plan($1, $2)`, [ORG.S, U.ownerS]);
    expect(plan.family).toBe("starter");
    expect((await upload(U.ownerS, receiptPath(ORG.S, U.ownerS))).ok).toBe(false);
  });
});

describe("receipts bucket — reads", () => {
  it("owner and managers see every receipt of their company, legacy included", async () => {
    const all = [staffReceipt, staff2Receipt, legacyReceipt].sort();
    expect(await visible(U.ownerA, all)).toEqual(all);
    expect(await visible(U.managerA, all)).toEqual(all);
  });

  it("staff see only their own uploads", async () => {
    expect(await visible(U.staffA, [staffReceipt, staff2Receipt, legacyReceipt])).toEqual([staffReceipt]);
    expect(await visible(U.staffA2, [staffReceipt, staff2Receipt, legacyReceipt])).toEqual([staff2Receipt]);
  });

  it("company Z and the cashier see nothing of company A", async () => {
    expect(await visible(U.ownerZ, [staffReceipt, staff2Receipt, legacyReceipt])).toEqual([]);
    expect(await visible(U.cashierA, [staffReceipt, staff2Receipt, legacyReceipt])).toEqual([]);
    expect(await visible(null, [staffReceipt])).toEqual([]);
  });

  it("a disabled member loses access", async () => {
    await q(`update public.memberships set disabled_at = now() where org_id = $1 and user_id = $2`, [ORG.A, U.staffA2]);
    try {
      expect(await visible(U.staffA2, [staff2Receipt])).toEqual([]);
    } finally {
      await q(`update public.memberships set disabled_at = null where org_id = $1 and user_id = $2`, [ORG.A, U.staffA2]);
    }
  });

  it("nobody but a platform admin can overwrite a receipt", async () => {
    const r = await as(U.ownerA, `update storage.objects set name = name || '.x' where name = $1 returning name`, [staffReceipt]);
    expect(r.ok && r.rows.length).toBeFalsy();
  });
});

describe("expenses with receipts", () => {
  const insertExpense = (user, fields) =>
    as(
      user,
      `insert into public.expenses (org_id, amount, date, vendor, receipt_path, supplier_id, client_operation_id, created_by_id)
       values ($1, $2, '2026-09-30', 'Woolworths', $3, $4, $5, $6) returning id`,
      [fields.org, fields.amount ?? 483, fields.receiptPath ?? null, fields.supplierId ?? null, fields.opId ?? null, user]
    );

  it("an attached receipt cannot be deleted; an unattached own upload can", async () => {
    const attached = receiptPath(ORG.A, U.staffA);
    const loose = receiptPath(ORG.A, U.staffA);
    expect((await upload(U.staffA, attached)).ok).toBe(true);
    expect((await upload(U.staffA, loose)).ok).toBe(true);
    const created = await insertExpense(U.staffA, { org: ORG.A, receiptPath: attached });
    expect(created.ok).toBe(true);

    const delAttached = await as(U.staffA, `delete from storage.objects where name = $1 returning name`, [attached]);
    expect(delAttached.ok && delAttached.rows.length).toBeFalsy();
    const delAttachedByOwner = await as(U.ownerA, `delete from storage.objects where name = $1 returning name`, [attached]);
    expect(delAttachedByOwner.ok && delAttachedByOwner.rows.length).toBeFalsy();
    const delLoose = await as(U.staffA, `delete from storage.objects where name = $1 returning name`, [loose]);
    expect(delLoose.ok && delLoose.rows.length).toBe(1);
    const delOther = await as(U.staffA, `delete from storage.objects where name = $1 returning name`, [staff2Receipt]);
    expect(delOther.ok && delOther.rows.length).toBeFalsy();
  });

  it("a receipt attached in the Expense form (receipt_url reference) cannot be deleted either", async () => {
    const attached = receiptPath(ORG.A, U.staffA);
    expect((await upload(U.staffA, attached)).ok).toBe(true);
    const url = `https://example.supabase.co/storage/v1/object/authenticated/receipts/${attached}`;
    const created = await as(
      U.staffA,
      `insert into public.expenses (org_id, amount, date, vendor, receipt_url, created_by_id)
       values ($1, 120, '2026-10-01', 'Spar', $2, auth.uid()) returning id`,
      [ORG.A, url]
    );
    expect(created.ok, created.message).toBe(true);
    for (const user of [U.staffA, U.ownerA]) {
      const del = await as(user, `delete from storage.objects where name = $1 returning name`, [attached]);
      expect(del.ok && del.rows.length, user).toBeFalsy();
    }
    // The cashier and another company still cannot even see it.
    expect(await visible(U.cashierA, [attached])).toEqual([]);
    expect(await visible(U.ownerZ, [attached])).toEqual([]);
    expect(await visible(U.staffA2, [attached])).toEqual([]);
    expect(await visible(U.ownerA, [attached])).toEqual([attached]);
  });

  it("receipt_path must be inside the expense's own company folder", async () => {
    const r = await insertExpense(U.ownerA, { org: ORG.A, receiptPath: receiptPath(ORG.Z, U.ownerZ) });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/expenses_receipt_path_org_scoped/);
  });

  it("one receipt backs at most one expense", async () => {
    const path = receiptPath(ORG.A, U.ownerA);
    expect((await insertExpense(U.ownerA, { org: ORG.A, receiptPath: path })).ok).toBe(true);
    const again = await insertExpense(U.ownerA, { org: ORG.A, receiptPath: path });
    expect(again.ok).toBe(false);
  });

  it("a supplier from another company is refused", async () => {
    const supplierZ = (await one(`insert into public.suppliers (org_id, name) values ($1, 'Z Supplies') returning id`, [ORG.Z])).id;
    const supplierA = (await one(`insert into public.suppliers (org_id, name) values ($1, 'Woolworths') returning id`, [ORG.A])).id;
    const bad = await insertExpense(U.ownerA, { org: ORG.A, supplierId: supplierZ });
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/Supplier does not belong/);
    // Staff cannot read suppliers but may still link their company's supplier.
    expect((await insertExpense(U.staffA, { org: ORG.A, supplierId: supplierA })).ok).toBe(true);
  });

  it("client_operation_id is unique per company (idempotent confirm)", async () => {
    const opId = randomUUID();
    expect((await insertExpense(U.ownerA, { org: ORG.A, opId })).ok).toBe(true);
    const retry = await insertExpense(U.ownerA, { org: ORG.A, opId });
    expect(retry.ok).toBe(false);
    expect(retry.code).toBe("23505");
    expect((await insertExpense(U.ownerZ, { org: ORG.Z, opId })).ok).toBe(true);
  });

  it("cross-company expense creation is refused (manipulated org_id)", async () => {
    expect((await insertExpense(U.ownerZ, { org: ORG.A })).ok).toBe(false);
    expect((await insertExpense(U.cashierA, { org: ORG.A })).ok).toBe(false);
  });
});
