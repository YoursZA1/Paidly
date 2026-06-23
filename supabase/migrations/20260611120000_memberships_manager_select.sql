-- Allow company managers and admins to read org membership rows (team directory).
-- Owners already had SELECT via organizations.owner_id; invited managers/admins did not.

DROP POLICY IF EXISTS "memberships_company_managers_select" ON public.memberships;
CREATE POLICY "memberships_company_managers_select"
  ON public.memberships
  FOR SELECT
  TO authenticated
  USING (
    public.is_company_manager_for_org(org_id)
  );
