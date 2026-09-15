-- CREATE OR REPLACE can drop EXECUTE on some Postgres builds (see
-- 20260618120000 / 20260624120000). PostgREST then returns HTTP 403 on
-- get_my_onboarding_context / get_my_tenant_context and on tables whose RLS
-- helpers lost GRANT. Re-assert authenticated EXECUTE/SELECT. Do not drop data.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.get_my_onboarding_context()',
    'public.get_my_tenant_context()',
    'public.is_admin()',
    'public.is_platform_admin()',
    'public.is_org_member(uuid)',
    'public.is_company_admin_for_org(uuid)',
    'public.is_company_manager_for_org(uuid)',
    'public.user_company_role_for_org(uuid)',
    'public.caller_membership_id_for_org(uuid)',
    'public.can_see_org_workforce(uuid)',
    'public.can_manage_org_payroll(uuid)',
    'public.can_read_org_financial_row(uuid, uuid, uuid, uuid)',
    'public.is_pos_only_staff()',
    'public.normalize_job_function(text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'regrant tenant rpcs: skipping missing function %', fn;
    END;
  END LOOP;
END$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations',
    'memberships',
    'invoices',
    'payments',
    'quotes',
    'pos_sales_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'regrant tenant rpcs: skipping missing table %', t;
    END;
  END LOOP;
END$$;
