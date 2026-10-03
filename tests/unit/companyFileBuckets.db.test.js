/**
 * activities + bank-details storage buckets on the REAL schema (every migration replayed on PGlite),
 * as signed-in users through storage RLS (20261003140000_scope_activities_bank_details_storage.sql).
 *
 *   bank-details (bank statements): owner / admin / manager of that company only
 *   activities (message + older expense attachments): uploader, or owner / admin / manager
 *   POS cashiers, disabled / revoked members and other companies: nothing
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const U = {
  owner: "c7000000-0000-4000-8000-000000000001",
  manager: "c7000000-0000-4000-8000-000000000002",
  staff: "c7000000-0000-4000-8000-000000000003",
  staff2: "c7000000-0000-4000-8000-000000000004",
  cashier: "c7000000-0000-4000-8000-000000000005",
  revoked: "c7000000-0000-4000-8000-000000000006",
  ownerZ: "c7000000-0000-4000-8000-000000000007",
};
const ORG = {};
let n = 0;
const file = (org, folder) => `${org}/${folder}/${Date.now()}-${(n += 1)}-file.pdf`;

const as = (user, sql, params) => runAs(db, user, sql, params);
const upload = (user, bucket, name) =>
  as(user, `insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, auth.uid(), auth.uid()::text) returning name`, [
    bucket,
    name,
  ]);
const seed = (bucket, name, owner) =>
  q(`insert into storage.objects (bucket_id, name, owner, owner_id) values ($1, $2, $3::uuid, $4)`, [bucket, name, owner, owner]);
const sees = async (user, name) => (await as(user, `select name from storage.objects where name = $1`, [name])).rows.length === 1;
const deletes = async (user, name) => {
  const r = await as(user, `delete from storage.objects where name = $1 returning name`, [name]);
  return r.ok && r.rows.length === 1;
};
const replaces = async (user, name) => {
  const r = await as(user, `update storage.objects set metadata = '{"v":2}' where name = $1 returning name`, [name]);
  return r.ok && r.rows.length === 1;
};

beforeAll(async () => {
  db = await replaySupabaseSchema();
  await q(`grant select, insert, update, delete on storage.objects to authenticated`);

  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'o@a.test', '{"org_name":"Padosio"}'), ($2, 'o@z.test', '{"org_name":"Zeta"}')`, [
    U.owner,
    U.ownerZ,
  ]);
  ORG.A = (await one(`select id from public.organizations where owner_id = $1`, [U.owner])).id;
  ORG.Z = (await one(`select id from public.organizations where owner_id = $1`, [U.ownerZ])).id;
  for (const [id, role, fn] of [
    [U.manager, "manager", "general"],
    [U.staff, "employee", "sales"],
    [U.staff2, "employee", "sales"],
    [U.cashier, "employee", "pos"],
    [U.revoked, "employee", "general"],
  ]) {
    await q(`insert into auth.users (id, email, invited_at, raw_user_meta_data) values ($1, $2, now(), '{"pending_company_invite":"true"}')`, [
      id,
      `${id}@a.test`,
    ]);
    await q(`insert into public.memberships (org_id, user_id, role, job_function) values ($1, $2, $3, $4)`, [ORG.A, id, role, fn]);
  }
  await q(`update public.memberships set portal_revoked_at = now() where user_id = $1`, [U.revoked]);
}, 180_000);

describe("bank-details (bank statements)", () => {
  it("owner and managers upload, read, replace and delete; staff, cashiers, revoked and other companies cannot", async () => {
    const stmt = file(ORG.A, "bank-details");
    expect((await upload(U.owner, "bank-details", stmt)).ok).toBe(true);
    for (const user of [U.owner, U.manager]) expect(await sees(user, stmt), user).toBe(true);
    for (const user of [U.staff, U.cashier, U.revoked, U.ownerZ]) {
      expect(await sees(user, stmt), user).toBe(false);
      expect(await replaces(user, stmt), user).toBe(false);
      expect(await deletes(user, stmt), user).toBe(false);
    }
    for (const user of [U.staff, U.cashier]) {
      expect((await upload(user, "bank-details", file(ORG.A, "bank-details"))).ok, user).toBe(false);
    }
    expect(await replaces(U.manager, stmt)).toBe(true);
    expect(await deletes(U.manager, stmt)).toBe(true);
  });
});

describe("activities (message and older expense attachments)", () => {
  it("any active non-POS member uploads into their own company only", async () => {
    expect((await upload(U.staff, "activities", file(ORG.A, "activities"))).ok).toBe(true);
    expect((await upload(U.cashier, "activities", file(ORG.A, "activities"))).ok).toBe(false);
    expect((await upload(U.revoked, "activities", file(ORG.A, "activities"))).ok).toBe(false);
    expect((await upload(U.staff, "activities", file(ORG.Z, "activities"))).ok).toBe(false); // manipulated company id
    expect((await upload(U.staff, "activities", "not-a-uuid/activities/x.pdf")).ok).toBe(false);
    expect((await upload(null, "activities", file(ORG.A, "activities"))).ok).toBe(false);
  });

  it("the uploader and owner/managers see a file; other staff, cashiers, revoked and other companies do not", async () => {
    const mine = file(ORG.A, "activities");
    expect((await upload(U.staff, "activities", mine)).ok).toBe(true);
    for (const user of [U.staff, U.owner, U.manager]) expect(await sees(user, mine), user).toBe(true);
    for (const user of [U.staff2, U.cashier, U.revoked, U.ownerZ]) expect(await sees(user, mine), user).toBe(false);
  });

  it("only the uploader or owner/managers can replace or delete", async () => {
    const mine = file(ORG.A, "activities");
    await seed("activities", mine, U.staff);
    for (const user of [U.staff2, U.cashier, U.ownerZ]) {
      expect(await replaces(user, mine), user).toBe(false);
      expect(await deletes(user, mine), user).toBe(false);
    }
    expect(await replaces(U.staff, mine)).toBe(true);
    expect(await deletes(U.staff, mine)).toBe(true);
    const other = file(ORG.A, "activities");
    await seed("activities", other, U.staff2);
    expect(await deletes(U.manager, other)).toBe(true);
  });

  it("an attachment a saved expense still references cannot be deleted", async () => {
    const att = file(ORG.A, "activities");
    await seed("activities", att, U.owner);
    await q(`insert into public.expenses (org_id, amount, date, vendor, receipt_url, created_by_id) values ($1, 50, '2026-09-01', 'Spar', $2, $3)`, [
      ORG.A,
      `https://x.supabase.co/storage/v1/object/public/activities/${att}`,
      U.owner,
    ]);
    expect(await deletes(U.owner, att)).toBe(false);
    expect(await sees(U.owner, att)).toBe(true);
  });

  it("an unfiltered listing never shows another company's files", async () => {
    await seed("activities", file(ORG.Z, "activities"), U.ownerZ);
    const r = await as(U.owner, `select name from storage.objects where bucket_id in ('activities', 'bank-details')`);
    expect(r.rows.every((row) => row.name.startsWith(`${ORG.A}/`))).toBe(true);
  });
});

describe("unchanged buckets", () => {
  it("paidly (public branding) is still readable and the catch-all no longer names these buckets", async () => {
    await seed("paidly", "logo-abc.png", U.owner);
    // "Public can read paidly assets" (anon + authenticated): another company's user still sees the logo.
    expect((await as(U.ownerZ, `select name from storage.objects where bucket_id = 'paidly' and name = 'logo-abc.png'`)).rows).toHaveLength(1);
    const [{ qual }] = await q(
      `select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'org members access assets'`
    );
    expect(qual).not.toMatch(/activities|bank-details/);
    const bare = await q(
      `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ~ '^org members .* (activities|bank-details)$'`
    );
    expect(bare).toEqual([]);
  });
});
