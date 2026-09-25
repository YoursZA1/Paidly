-- Restore EXECUTE for `authenticated` on the functions RLS policies and the SPA need (2026-09-25).
--
-- Symptom (production): every signed-in request to organizations / memberships / invoices, and the
-- RPCs get_my_onboarding_context / get_my_tenant_context, fails with HTTP 403 (SQLSTATE 42501).
-- Cause: EXECUTE on the policy helper functions (is_company_admin_for_org, …) was revoked from
-- `authenticated` outside of migrations — no migration in this repo revokes it; they only grant it
-- (20260610120000, 20260612120000, 20260618120000, 20260619130000, 20260623130000). RLS policies
-- call their helpers as the requesting role, so without EXECUTE the whole query fails before any row
-- is checked. (The Security Advisor suggestion "revoke EXECUTE on SECURITY DEFINER functions" is right
-- for anon, but applied to authenticated it breaks RLS.)
--
-- What this grants — to `authenticated` only, never `anon`:
--   1. every public function referenced by a live RLS policy (read from pg_policies when applied, so
--      policies created outside migrations are covered too);
--   2. the RPCs the SPA calls (src/**: supabase.rpc(...)) and the repo's known RLS helpers, by name;
--   3. any public function those call while running as the caller (SECURITY INVOKER bodies),
--      repeated until nothing new is found.
-- It revokes nothing and changes no function, policy or table.
-- Check first / after: supabase/scripts/authenticated_function_grants_report.sql
--
-- Idempotent.

DO $$
DECLARE
  v_needed oid[];
  v_next oid[];
  v_fn oid;
  v_granted int := 0;
BEGIN
  -- 1 + 2: seeds.
  SELECT coalesce(array_agg(DISTINCT p.oid), '{}')
  INTO v_needed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prokind = 'f'
    AND (
      EXISTS (
        SELECT 1 FROM pg_policies pol
        WHERE pol.schemaname = 'public'
          AND (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ ('\m' || p.proname || '\s*\(')
      )
      -- RPCs the SPA calls
      OR p.proname IN (
        'accept_company_invite_token', 'adjust_inventory_stock', 'convert_quote_to_invoice',
        'get_my_onboarding_context', 'get_my_tenant_context', 'next_document_number',
        'receive_purchase_order_item'
      )
      -- RLS helpers used by the repo's policies (explicit, in case a live policy's text is not matched)
      OR p.proname IN (
        'is_company_admin_for_org', 'is_company_manager_for_org', 'can_read_org_financial_row',
        'can_read_document_row', 'can_read_payslip_row', 'can_see_org_workforce',
        'caller_membership_id_for_org', 'current_company_id', 'is_admin', 'is_audit_log_viewer',
        'is_billing_admin', 'is_client_timeline_editor', 'is_internal_team', 'is_org_member',
        'is_payroll_admin_for_org', 'is_platform_admin', 'is_pos_only_staff', 'profile_role_value',
        'org_has_pos_permission'
      )
    );

  -- 3: functions called from SECURITY INVOKER bodies run as the caller too — close over them.
  LOOP
    SELECT coalesce(array_agg(DISTINCT callee.oid), '{}')
    INTO v_next
    FROM pg_proc caller
    JOIN pg_proc callee ON callee.pronamespace = caller.pronamespace
    WHERE caller.oid = ANY (v_needed)
      AND NOT caller.prosecdef
      AND callee.prokind = 'f'
      AND NOT (callee.oid = ANY (v_needed))
      AND caller.prosrc ~ ('\m' || callee.proname || '\s*\(');
    EXIT WHEN cardinality(v_next) = 0;
    v_needed := v_needed || v_next;
  END LOOP;

  FOREACH v_fn IN ARRAY v_needed LOOP
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn::regprocedure);
      v_granted := v_granted + 1;
      RAISE NOTICE 'granted EXECUTE to authenticated on %', v_fn::regprocedure;
    END IF;
  END LOOP;

  RAISE NOTICE 'authenticated RLS/RPC function grants: % checked, % restored', cardinality(v_needed), v_granted;
END $$;

-- Post-condition: nothing a live policy calls is left unexecutable for signed-in users.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(DISTINCT p.oid::regprocedure::text, ', ')
  INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  JOIN pg_policies pol ON pol.schemaname = 'public'
    AND (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ ('\m' || p.proname || '\s*\(')
  WHERE p.prokind = 'f'
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated still cannot execute policy functions: %', v_missing;
  END IF;
END $$;
