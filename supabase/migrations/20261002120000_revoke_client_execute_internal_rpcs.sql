-- Server-only RPCs: no EXECUTE for browser roles (2026-10-02 fuzz/security audit).
--
-- Problem: these SECURITY DEFINER functions run as the table owner and check nothing about the caller.
-- Their migrations did `REVOKE ALL ... FROM PUBLIC`, but on Supabase `anon` and `authenticated` hold
-- their OWN explicit EXECUTE grant (default privileges on schema public), so revoking from PUBLIC left
-- them callable from the browser through POST /rest/v1/rpc/<name> with only the public anon key.
-- Proven on the replayed schema (tests/unit/internalRpcExecute.db.test.js):
--   * apply_verified_payfast_payment: anyone, without signing in, marks any subscription 'active'
--     until any date and writes a forged payment_history row.
--   * payfast_itn_replace_user_subscription: a signed-in user gives themselves an active Growth plan,
--     or deactivates every subscription of any other user.
--   * company_access_subscription: returns the full subscriptions row (email, PayFast token, amounts)
--     of any company or user.
--   * delete_pos_connection: deletes any business's POS connection.
--   * upsert_user_company_role, start_owner_system_trial, mark_company_invite_accepted,
--     sync_saas_user_roles, mirror_company_plan_to_profiles, admin_delete_orphan_profiles,
--     expire_all_overdue_trials, log_* : writes on behalf of arbitrary users / forged audit rows.
--
-- Fix: EXECUTE only for service_role. Every legitimate caller is either the server (service-role
-- client: ITN pipeline, cron, team/invite routes, POS connections) or another SECURITY DEFINER function
-- (handle_new_user, accept_company_invite_token, sync_profile_from_subscription_row,
-- paidly_org_has_feature, paidly_assert_plan_feature, …), which runs as the owner and keeps working.
-- None is referenced by an RLS policy, a SECURITY INVOKER function, or the SPA.
--
-- Not changed: functions, policies, tables, data. Idempotent. Skips signatures that do not exist.
-- Check after applying (should return no rows):
--   select p.oid::regprocedure from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('apply_verified_payfast_payment', 'payfast_itn_replace_user_subscription', ...)
--     and (has_function_privilege('anon', p.oid, 'EXECUTE')
--          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

DO $$
DECLARE
  v_sig text;
  v_fn regprocedure;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    -- writes
    'public.apply_verified_payfast_payment(uuid, text, numeric, text, text, jsonb, timestamptz, text, text, text, uuid, text)',
    'public.payfast_itn_replace_user_subscription(uuid, jsonb)',
    'public.delete_pos_connection(uuid, uuid)',
    'public.upsert_user_company_role(uuid, uuid, text, text, uuid)',
    'public.start_owner_system_trial(uuid, uuid, text)',
    'public.start_owner_system_trial(uuid, uuid)',
    'public.mark_company_invite_accepted(text, uuid)',
    'public.sync_saas_user_roles(uuid)',
    'public.mirror_company_plan_to_profiles(uuid, uuid)',
    'public.admin_delete_orphan_profiles()',
    'public.expire_all_overdue_trials()',
    'public.log_payfast_itn(jsonb, text, boolean, boolean, boolean, boolean)',
    'public.log_subscription_event(uuid, text, text, jsonb)',
    'public.log_webhook(text, jsonb, jsonb, jsonb, integer, integer, text, text, text)',
    'public.record_message_log_open(text)',
    -- reads of other tenants' billing rows
    'public.company_access_subscription(uuid, uuid)',
    'public.paidly_company_plan(uuid, uuid)',
    'public.paidly_user_company_id(uuid)'
  ]
  LOOP
    v_fn := to_regprocedure(v_sig);
    CONTINUE WHEN v_fn IS NULL;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END $$;
