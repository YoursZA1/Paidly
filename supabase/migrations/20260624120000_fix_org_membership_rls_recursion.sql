-- HOTFIX: infinite recursion (42P17) between organizations and memberships RLS → 500s.
--
-- Root cause (introduced 2026-06-23 in 20260619120000_multi_tenant_company_extension.sql):
--   organizations."organizations_member_select" SELECT policy inlines
--       EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = organizations.id AND m.user_id = auth.uid())
--   while the base-schema memberships."memberships org access" SELECT policy inlines
--       EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = memberships.org_id AND o.owner_id = auth.uid()).
--   Each table's RLS now reads the other, so Postgres raises:
--       42P17 "infinite recursion detected in policy for relation organizations"
--   PostgREST surfaces that as HTTP 500. Every read that touches this pair (organizations,
--   memberships, and any table whose policy does EXISTS(... memberships ...): invoices,
--   quotes, payslips, clients) cascades to 500. The base-schema author had deliberately kept
--   "memberships org access" non-recursive; the new org policy reintroduced the cycle from the
--   other side.
--
-- Fix: route the organizations→membership check through a SECURITY DEFINER helper, which is
-- evaluated as the function owner and therefore BYPASSES memberships RLS. That removes the only
-- organizations→memberships RLS edge, making the policy graph acyclic again. Semantics are
-- preserved exactly: a user may SELECT an org they own, are a company admin of, or are a member of.

-- ── Non-recursive membership probe (bypasses RLS via SECURITY DEFINER) ─────────
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_org_member(uuid) IS
  'True if auth.uid() has a membership row in target_org_id. SECURITY DEFINER so it bypasses '
  'memberships RLS and cannot recurse when called from the organizations SELECT policy.';

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- ── Recreate the org SELECT policy without the inline memberships subquery ──────
DROP POLICY IF EXISTS "organizations_member_select" ON public.organizations;
CREATE POLICY "organizations_member_select"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.is_company_admin_for_org(id)
    OR public.is_org_member(id)
  );

-- ── Belt-and-suspenders: re-assert EXECUTE on the RLS helper functions ──────────
-- CREATE OR REPLACE across the recent migration churn can leave a helper without EXECUTE for
-- `authenticated` on some Postgres builds, which surfaces identically as a 500
-- ("permission denied for function ..."). Re-granting is idempotent and harmless. Wrapped per
-- function so a not-yet-applied helper on a partially-migrated database cannot abort this hotfix.
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.is_admin()',
    'public.is_org_member(uuid)',
    'public.normalize_company_role(text)',
    'public.user_primary_org_id()',
    'public.user_company_role_for_org(uuid)',
    'public.is_company_admin_for_org(uuid)',
    'public.is_company_manager_for_org(uuid)',
    'public.can_read_org_financial_row(uuid, uuid, uuid, uuid)',
    'public.can_read_document_row(public.documents)',
    'public.can_read_payslip_row(public.payslips)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'is_org_member hotfix: skipping grant for missing function %', fn;
    END;
  END LOOP;
END$$;
