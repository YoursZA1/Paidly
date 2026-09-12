-- Managers without payroll capability must not SELECT other people's pay.
-- Finance managers (job_function=finance) keep full-row access. Do not change
-- is_company_manager_for_org — leave and POS still use it.

CREATE OR REPLACE FUNCTION public.can_manage_org_payroll(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_company_admin_for_org(target_org_id)
    OR (
      public.user_company_role_for_org(target_org_id) = 'manager'
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = target_org_id
          AND m.user_id = auth.uid()
          AND public.normalize_job_function(m.job_function) = 'finance'
      )
      AND NOT public.is_pos_only_staff()
    );
$$;

COMMENT ON FUNCTION public.can_manage_org_payroll(uuid) IS
  'True for platform admins, company admins, and manager+finance. Not every org manager.';

CREATE OR REPLACE FUNCTION public.can_read_payslip_row(p public.payslips)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = p.org_id
      AND m.user_id = auth.uid()
  )
  AND (
    public.is_admin()
    OR public.is_company_admin_for_org(p.org_id)
    OR public.can_manage_org_payroll(p.org_id)
    OR p.employee_user_id = auth.uid()
    OR p.user_id = auth.uid()
    OR p.created_by_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships own
      WHERE own.id = p.membership_id
        AND own.user_id = auth.uid()
        AND NOT public.is_pos_only_staff()
    )
    OR (
      p.employee_email IS NOT NULL
      AND lower(trim(p.employee_email)) = lower(trim(coalesce(
        (SELECT pr.email FROM public.profiles pr WHERE pr.id = auth.uid()),
        ''
      )))
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_org_payroll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_payslip_row(public.payslips) TO authenticated;
