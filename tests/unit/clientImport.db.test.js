/**
 * Client Import on the REAL schema (every migration replayed on PGlite), as signed-in users through RLS.
 *
 * client_import_matches() only returns the asked-for business's clients, and only to its owner, an admin
 * or a manager (who can already read every client there). import_ref makes a retried insert a no-op. The existing clients RLS and plan trigger still decide
 * who can write. client_import_runs holds counts only and follows can_view_org_financials.
 * All people and businesses are fictional.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params) => runAs(db, user, sql, params);

const U = {
  ownerA: "a3000000-0000-4000-8000-000000000001",
  managerA: "a3000000-0000-4000-8000-000000000002",
  employeeA: "a3000000-0000-4000-8000-000000000003",
  cashierA: "b3000000-0000-4000-8000-000000000001",
  ownerB: "f3000000-0000-4000-8000-000000000001",
  ownerL: "e3000000-0000-4000-8000-000000000001",
};
const ORG = {};
const IMPORT = "55555555-5555-4555-8555-555555555555";

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

/** The same statement the route sends: upsert on (org_id, import_ref), ignore duplicates. */
const importClient = (user, org, name, extra = {}) =>
  as(
    user,
    `insert into public.clients (org_id, created_by_id, name, email, phone, tax_id, import_ref, pos_enabled)
     values ($1, $2, $3, $4, $5, $6, $7, false)
     on conflict (org_id, import_ref) do nothing
     returning id`,
    [org, extra.createdBy ?? user, name, extra.email ?? null, extra.phone ?? null, extra.tax_id ?? null, extra.import_ref ?? null]
  );

const matches = (user, org, { emails = [], phones = [], taxes = [] }) =>
  as(user, `select * from public.client_import_matches($1, $2, $3, $4)`, [org, emails, phones, taxes]);

const recordRun = (user, org, extra = {}) =>
  as(
    user,
    `insert into public.client_import_runs (id, org_id, created_by_id, filename, status, created_count)
     values ($1, $2, $3, 'clients.csv', 'completed', 3)
     on conflict (id) do update set created_count = public.client_import_runs.created_count + excluded.created_count
     returning id, created_count`,
    [extra.id ?? IMPORT, org, extra.createdBy ?? user]
  );

beforeAll(async () => {
  db = await replaySupabaseSchema();
  ORG.A = await signUp(U.ownerA, "owner@a.test", "Harbour Traders");
  ORG.B = await signUp(U.ownerB, "owner@b.test", "Inland Traders");
  ORG.L = await signUp(U.ownerL, "owner@l.test", "Lapsed Co");
  await inviteInto(ORG.A, U.managerA, "manager@a.test", "manager", "general");
  await inviteInto(ORG.A, U.employeeA, "staff@a.test", "employee", "general");
  await inviteInto(ORG.A, U.cashierA, "till@a.test", "employee", "pos");
  await activePlan(U.ownerA, ORG.A, "business");
  await activePlan(U.ownerB, ORG.B, "business");

  for (const [user, org, name, extra] of [
    [U.ownerA, ORG.A, "Thabo Nkosi", { email: "Thabo@Example.co.za", phone: "082 555 0101", tax_id: "4123 456 789" }],
    [U.ownerB, ORG.B, "Other Business Thabo", { email: "thabo@example.co.za", phone: "0825550101", tax_id: "4123456789" }],
  ]) {
    const r = await importClient(user, org, name, extra);
    if (!r.ok) throw new Error(`seed ${name}: ${r.message}`);
  }
  // Lapsed: the subscription ended and there is no running trial.
  await q(
    `update public.subscriptions set status = 'expired', trial_ends_at = now() - interval '1 day',
       current_period_end = now() - interval '1 day' where company_id = $1`,
    [ORG.L]
  );
}, 120_000);

describe("client_import_matches", () => {
  it("finds this business's client by email, phone and tax number, ignoring case, prefixes and spacing", async () => {
    const byEmail = await matches(U.ownerA, ORG.A, { emails: ["thabo@example.co.za"] });
    expect(byEmail.ok).toBe(true);
    expect(byEmail.rows.map((r) => r.name)).toEqual(["Thabo Nkosi"]);
    const byPhone = await matches(U.ownerA, ORG.A, { phones: ["+27 82 555 0101"] });
    expect(byPhone.rows.map((r) => r.name)).toEqual(["Thabo Nkosi"]);
    const byTax = await matches(U.ownerA, ORG.A, { taxes: ["4123456789"] });
    expect(byTax.rows.map((r) => r.name)).toEqual(["Thabo Nkosi"]);
  });

  it("never returns another business's clients, even when that business's id is passed", async () => {
    const r = await matches(U.ownerA, ORG.B, { emails: ["thabo@example.co.za"] });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it("returns nothing to an employee, a cashier or a disabled manager of the same business", async () => {
    for (const user of [U.employeeA, U.cashierA]) {
      const r = await matches(user, ORG.A, { emails: ["thabo@example.co.za"] });
      expect(r.ok).toBe(true);
      expect(r.rows).toEqual([]);
    }
    const manager = await matches(U.managerA, ORG.A, { emails: ["thabo@example.co.za"] });
    expect(manager.rows.map((r) => r.name)).toEqual(["Thabo Nkosi"]);
    await q(`update public.memberships set disabled_at = now() where org_id = $1 and user_id = $2`, [ORG.A, U.managerA]);
    try {
      const disabled = await matches(U.managerA, ORG.A, { emails: ["thabo@example.co.za"] });
      expect(disabled.rows ?? []).toEqual([]);
    } finally {
      await q(`update public.memberships set disabled_at = null where org_id = $1 and user_id = $2`, [ORG.A, U.managerA]);
    }
  });

  it("does not match on the name alone", async () => {
    const r = await matches(U.ownerA, ORG.A, { emails: ["someone.else@example.co.za"] });
    expect(r.rows).toEqual([]);
  });

  it("cannot be called without signing in", async () => {
    const r = await matches(null, ORG.A, { emails: ["thabo@example.co.za"] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("42501");
  });
});

describe("imported client writes", () => {
  it("lets a manager import, and a retried insert with the same import_ref creates nothing", async () => {
    const ref = `${IMPORT}:7`;
    const first = await importClient(U.managerA, ORG.A, "José Muñoz", { email: "jose@example.co.za", import_ref: ref });
    expect(first.ok).toBe(true);
    expect(first.rows).toHaveLength(1);
    const again = await importClient(U.managerA, ORG.A, "José Muñoz", { email: "jose@example.co.za", import_ref: ref });
    expect(again.ok).toBe(true);
    expect(again.rows).toHaveLength(0);
    const count = await one(`select count(*)::int as n from public.clients where org_id = $1 and import_ref = $2`, [ORG.A, ref]);
    expect(count.n).toBe(1);
  });

  it("allows the same import_ref in a different business", async () => {
    const r = await importClient(U.ownerB, ORG.B, "Inland Client", { email: "inland@example.co.za", import_ref: `${IMPORT}:7` });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  it("refuses an insert into another business", async () => {
    const r = await importClient(U.ownerA, ORG.B, "Sneaky Row", { email: "sneaky@example.co.za", import_ref: `${IMPORT}:99` });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("42501");
  });

  it("does not let an owner update another business's client", async () => {
    const r = await as(U.ownerA, `update public.clients set notes = 'changed' where org_id = $1 returning id`, [ORG.B]);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
    const other = await one(`select notes from public.clients where org_id = $1 and name = 'Other Business Thabo'`, [ORG.B]);
    expect(other.notes).toBeNull();
  });

  it("stops a lapsed business with the hint the route turns into a clear message", async () => {
    const created = await importClient(U.ownerL, ORG.L, "Lapsed Client", { email: "lapsed@example.co.za" });
    const r = created.ok
      ? await as(U.ownerL, `update public.clients set notes = 'x' where org_id = $1 returning id`, [ORG.L])
      : created;
    expect(r.ok).toBe(false);
    expect(r.code).toBe("P0001");
    expect(String(r.hint)).toMatch(/^(SUBSCRIPTION_REQUIRED|UPGRADE_REQUIRED)/);
  });
});

describe("client_import_runs", () => {
  it("records counts for the owner and adds a retried batch onto the same run", async () => {
    const first = await recordRun(U.ownerA, ORG.A);
    expect(first.ok).toBe(true);
    const again = await recordRun(U.ownerA, ORG.A);
    expect(again.ok).toBe(true);
    expect(again.rows[0].created_count).toBe(6);
  });

  it("is readable by a manager of the business but not by an employee, a cashier or another business", async () => {
    const manager = await as(U.managerA, `select id from public.client_import_runs where org_id = $1`, [ORG.A]);
    expect(manager.rows.map((r) => r.id)).toEqual([IMPORT]);
    for (const user of [U.employeeA, U.cashierA, U.ownerB]) {
      const r = await as(user, `select id from public.client_import_runs where org_id = $1`, [ORG.A]);
      expect(r.ok).toBe(true);
      expect(r.rows).toEqual([]);
    }
  });

  it("refuses a run written for another person or another business", async () => {
    const forSomeoneElse = await recordRun(U.managerA, ORG.A, { id: "66666666-6666-4666-8666-666666666666", createdBy: U.ownerA });
    expect(forSomeoneElse.ok).toBe(false);
    const intoB = await recordRun(U.ownerA, ORG.B, { id: "77777777-7777-4777-8777-777777777777" });
    expect(intoB.ok).toBe(false);
  });

  it("cannot be overwritten by another business reusing the same run id", async () => {
    const r = await recordRun(U.ownerB, ORG.B);
    expect(r.ok).toBe(false);
    const row = await one(`select org_id, created_count from public.client_import_runs where id = $1`, [IMPORT]);
    expect(row.org_id).toBe(ORG.A);
    expect(row.created_count).toBe(6);
  });

  it("is closed to a disabled manager", async () => {
    await q(`update public.memberships set disabled_at = now() where org_id = $1 and user_id = $2`, [ORG.A, U.managerA]);
    try {
      const r = await as(U.managerA, `select id from public.client_import_runs where org_id = $1`, [ORG.A]);
      expect(r.rows ?? []).toEqual([]);
    } finally {
      await q(`update public.memberships set disabled_at = null where org_id = $1 and user_id = $2`, [ORG.A, U.managerA]);
    }
  });
});
