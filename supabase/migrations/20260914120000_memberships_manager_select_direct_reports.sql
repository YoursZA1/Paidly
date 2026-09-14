-- Line managers must not SELECT every membership in the org.
-- Tighten directory SELECT to: self, direct reports (manager_membership_id = caller),
-- or org-wide workforce (admin / HR / finance). Do not change is_company_manager_for_org
-- (leave and POS still use it). Payslip compensation RLS stays
-- 20260912140000_payslip_compensation_rls.sql (can_read_payslip_row).
-- Do not drop or empty memberships rows.

CREATE OR REPLACE FUNCTION public.caller_membership_id_for_org(target_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.memberships m
  WHERE m.org_id = target_org_id
    AND m.user_id = auth.uid()
  ORDER BY m.created_at ASC
  LIMIT 1
$$;

COMMENT ON FUNCTION public.caller_membership_id_for_org(uuid) IS
  'Caller membership UUID in the org. SECURITY DEFINER so memberships RLS cannot recurse.';

CREATE OR REPLACE FUNCTION public.can_see_org_workforce(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_company_admin_for_org(target_org_id)
    OR public.can_manage_org_payroll(target_org_id)
    OR (
      public.user_company_role_for_org(target_org_id) = 'manager'
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = target_org_id
          AND m.user_id = auth.uid()
          AND public.normalize_job_function(m.job_function) = 'hr'
      )
      AND NOT public.is_pos_only_staff()
    );
$$;

COMMENT ON FUNCTION public.can_see_org_workforce(uuid) IS
  'True for platform admins, company admins, manager+hr, and manager+finance. Not department managers.';

GRANT EXECUTE ON FUNCTION public.caller_membership_id_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_org_workforce(uuid) TO authenticated;

DROP POLICY IF EXISTS "memberships_company_managers_select" ON public.memberships;

DROP POLICY IF EXISTS "memberships org directory" ON public.memberships;
CREATE POLICY "memberships org directory"
  ON public.memberships
  FOR SELECT
  USING (
    public.is_admin()
    OR public.can_see_org_workforce(org_id)
    OR memberships.user_id = (SELECT auth.uid())
    OR (
      memberships.manager_membership_id IS NOT NULL
      AND memberships.manager_membership_id = public.caller_membership_id_for_org(org_id)
    )
  );
