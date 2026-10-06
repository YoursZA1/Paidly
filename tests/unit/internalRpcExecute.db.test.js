/**
 * Server-only RPCs are not callable from the browser (real schema replayed on PGlite, called through
 * PostgREST's roles: `anon` = public anon key, `authenticated` = any signed-in user).
 *
 * Regression for the 2026-10-02 fuzz audit: SECURITY DEFINER functions that trust their arguments
 * kept Supabase's explicit EXECUTE grant for anon/authenticated (their migrations only revoked from
 * PUBLIC). Fixed by 20261002120000_revoke_client_execute_internal_rpcs.sql.
 * `PAIDLY_REPLAY_BEFORE=20261002120000` reproduces the exploits.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const U = {
  ownerA: "a1000000-0000-4000-8000-000000000001",
  attacker: "e1000000-0000-4000-8000-000000000001",
  newcomer: "c1000000-0000-4000-8000-000000000001",
};
const ROW = {};

const SERVER_ONLY = [
  "apply_verified_payfast_payment",
  "payfast_itn_replace_user_subscription",
  "delete_pos_connection",
  "upsert_user_company_role",
  "start_owner_system_trial",
  "mark_company_invite_accepted",
  "sync_saas_user_roles",
  "mirror_company_plan_to_profiles",
  "admin_delete_orphan_profiles",
  "expire_all_overdue_trials",
  "log_payfast_itn",
  "log_subscription_event",
  "log_webhook",
  "record_message_log_open",
  "company_access_subscription",
  "paidly_company_plan",
  "paidly_user_company_id",
  "purchase_order_recalculate",
  "purchase_order_refresh_paid",
  "purchase_order_log_event",
];

beforeAll(async () => {
  db = await replaySupabaseSchema();
  await q(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'owner@a.test', '{"org_name":"Company A","plan":"starter"}'),
       ($2, 'attacker@x.test', '{"org_name":"Attacker Co","plan":"starter"}')`,
    [U.ownerA, U.attacker]
  );
  ROW.orgA = (await one(`select id from public.organizations where owner_id = $1`, [U.ownerA])).id;
  ROW.subA = (
    await one(
      `insert into public.subscriptions (email, user_id, company_id, created_by, status, plan, current_plan,
         plan_slug, plan_family, amount, currency, billing_cycle, trial_ends_at)
       values ('owner@a.test', $1, $2, $1, 'expired', 'starter', 'starter', 'starter_monthly', 'starter', 0,
         'ZAR', 'monthly', now() - interval '1 day')
       returning id`,
      [U.ownerA, ROW.orgA]
    )
  ).id;
  ROW.connA = (
    await one(
      `insert into public.pos_connections (org_id, provider, webhook_token, webhook_secret)
       values ($1, 'generic', 'tok-rpc', 'secret-rpc') returning id`,
      [ROW.orgA]
    )
  ).id;
}, 600_000);

describe("grants", () => {
  it.each(SERVER_ONLY)("%s: no EXECUTE for anon or authenticated, EXECUTE for service_role", async (name) => {
    const rows = await q(
      `select has_function_privilege('anon', p.oid, 'EXECUTE') anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') authed,
              has_function_privilege('service_role', p.oid, 'EXECUTE') service
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [name]
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toEqual({ anon: false, authed: false, service: true });
  });
});

describe("exploits are refused", () => {
  it("anon cannot mark a subscription paid or forge a PayFast payment", async () => {
    const r = await runAs(
      db,
      null,
      `select public.apply_verified_payfast_payment($1, 'pf-forged', 999, 'ZAR', 'COMPLETE', '{}'::jsonb,
         now() + interval '10 years', 'active')`,
      [ROW.subA]
    );
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect((await one(`select status from public.subscriptions where id = $1`, [ROW.subA])).status).toBe("expired");
    expect(await q(`select 1 from public.payment_history where payfast_payment_id = 'pf-forged'`)).toEqual([]);
  });

  it("a signed-in user cannot grant themselves a paid plan", async () => {
    const r = await runAs(
      db,
      U.attacker,
      `select public.payfast_itn_replace_user_subscription($1,
         '{"email":"attacker@x.test","plan":"growth","current_plan":"growth","status":"active","amount":0}'::jsonb)`,
      [U.attacker]
    );
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect(await q(`select 1 from public.subscriptions where user_id = $1 and status = 'active'`, [U.attacker])).toEqual(
      []
    );
  });

  it("a signed-in user cannot deactivate another user's subscriptions", async () => {
    const r = await runAs(
      db,
      U.attacker,
      `select public.payfast_itn_replace_user_subscription($1, '{"email":"x@x.test"}'::jsonb)`,
      [U.ownerA]
    );
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect((await one(`select status from public.subscriptions where id = $1`, [ROW.subA])).status).toBe("expired");
  });

  it("anon cannot read another company's subscription row", async () => {
    const r = await runAs(db, null, `select (public.company_access_subscription($1, null)).email`, [ROW.orgA]);
    expect(r).toMatchObject({ ok: false, code: "42501" });
  });

  it("anon cannot delete another business's POS connection", async () => {
    const r = await runAs(db, null, `select public.delete_pos_connection($1, $2)`, [ROW.orgA, ROW.connA]);
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect(await q(`select 1 from public.pos_connections where id = $1`, [ROW.connA])).toHaveLength(1);
  });

  it("a signed-in user cannot write onboarding roles into another business", async () => {
    const r = await runAs(db, U.attacker, `select public.upsert_user_company_role($1, $2, 'owner', 'admin', null)`, [
      U.attacker,
      ROW.orgA,
    ]);
    expect(r).toMatchObject({ ok: false, code: "42501" });
  });

  it("anon cannot forge billing audit rows", async () => {
    const r = await runAs(db, null, `select public.log_subscription_event($1, 'payment_completed', 'itn', '{}'::jsonb)`, [
      ROW.subA,
    ]);
    expect(r).toMatchObject({ ok: false, code: "42501" });
  });
});

describe("legitimate callers still work (SECURITY DEFINER chains run as the owner)", () => {
  it("self sign-up still creates the org, owner membership and onboarding role", async () => {
    await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'new@n.test', $2)`, [
      U.newcomer,
      JSON.stringify({ org_name: "Newcomer Co", plan: "business" }),
    ]);
    const org = await one(`select id from public.organizations where owner_id = $1`, [U.newcomer]);
    expect(org?.id).toBeTruthy();
    expect(await q(`select 1 from public.user_company_roles where user_id = $1`, [U.newcomer])).toHaveLength(1);
  });

  it("subscription writes still mirror the plan onto profiles", async () => {
    await q(`update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days' where id = $1`, [
      ROW.subA,
    ]);
    const profile = await one(`select subscription_status from public.profiles where id = $1`, [U.ownerA]);
    expect(profile.subscription_status).toBe("active");
  });

  it("the plan-feature gate still answers for a signed-in member", async () => {
    const r = await runAs(db, U.ownerA, `select public.paidly_org_has_feature($1, 'invoices') ok`, [ROW.orgA]);
    expect(r.ok).toBe(true);
    expect(typeof r.rows[0].ok).toBe("boolean");
  });

  it("the server (service_role) can still apply a verified payment", async () => {
    await db.exec("begin");
    try {
      await db.exec("set local role service_role");
      const res = await db.query(
        `select public.apply_verified_payfast_payment($1, 'pf-real-1', 199, 'ZAR', 'COMPLETE', '{}'::jsonb) r`,
        [ROW.subA]
      );
      expect(res.rows[0].r.ok).toBe(true);
    } finally {
      await db.exec("rollback");
    }
  });
});
