/**
 * Real schema replayed on PGlite: each verified PayFast charge gets its own ledger row recording
 * the period it paid for, and a repeated ITN (same pf_payment_id) changes nothing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const OWNER = "b2000000-0000-4000-8000-000000000001";
let subId;

async function asServer(sql, params) {
  await db.exec("begin");
  try {
    await db.exec("set local role service_role");
    const res = await db.query(sql, params);
    await db.exec("commit");
    return res.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const apply = (pfId, periodEnd) =>
  asServer(
    `select public.apply_verified_payfast_payment($1, $2, 350, 'ZAR', 'completed', '{}'::jsonb, $3::timestamptz) r`,
    [subId, pfId, periodEnd]
  ).then((rows) => rows[0].r);

beforeAll(async () => {
  db = await replaySupabaseSchema();
  await q(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ledger@a.test', '{"org_name":"Ledger Co","plan":"growth"}')`,
    [OWNER]
  );
  const org = (await one(`select id from public.organizations where owner_id = $1`, [OWNER])).id;
  subId = (
    await one(
      `insert into public.subscriptions (email, user_id, company_id, created_by, status, plan, current_plan,
         plan_slug, plan_family, amount, currency, billing_cycle)
       values ('ledger@a.test', $1, $2, $1, 'pending', 'growth', 'growth', 'growth_monthly', 'growth', 350, 'ZAR', 'monthly')
       returning id`,
      [OWNER, org]
    )
  ).id;
}, 600_000);

describe("payment ledger", () => {
  it("first payment activates and records the period it paid for", async () => {
    const r = await apply("pf-first", "2026-11-08T00:00:00Z");
    expect(r.ok).toBe(true);
    expect(r.payment_type).toBe("initial");
    const sub = await one(`select status, current_period_end, next_billing_date from public.subscriptions where id = $1`, [subId]);
    expect(sub.status).toBe("active");
    expect(new Date(sub.next_billing_date).toISOString()).toBe("2026-11-08T00:00:00.000Z");
    const pay = await one(`select payment_type, billing_period_end from public.payment_history where payfast_payment_id = 'pf-first'`);
    expect(pay.payment_type).toBe("initial");
    expect(new Date(pay.billing_period_end).toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });

  it("a renewal gets its own row with its own period; history is not overwritten", async () => {
    const r = await apply("pf-renew-1", "2026-12-08T00:00:00Z");
    expect(r.payment_type).toBe("renewal");
    const rows = await q(`select payfast_payment_id, billing_period_start, billing_period_end from public.payment_history where subscription_id = $1 order by billing_period_end`, [subId]);
    expect(rows.map((x) => x.payfast_payment_id)).toEqual(["pf-first", "pf-renew-1"]);
    const renewal = rows[1];
    expect(new Date(renewal.billing_period_end).toISOString()).toBe("2026-12-08T00:00:00.000Z");
    expect(new Date(renewal.billing_period_start).getTime()).toBeLessThan(new Date(renewal.billing_period_end).getTime());
  });

  it("the same ITN twice creates no second payment and does not extend the period again", async () => {
    const again = await apply("pf-renew-1", "2027-01-08T00:00:00Z");
    expect(again.duplicate).toBe(true);
    const count = await one(`select count(*)::int n from public.payment_history where payfast_payment_id = 'pf-renew-1'`);
    expect(count.n).toBe(1);
    const sub = await one(`select next_billing_date from public.subscriptions where id = $1`, [subId]);
    expect(new Date(sub.next_billing_date).toISOString()).toBe("2026-12-08T00:00:00.000Z");
  });
});
