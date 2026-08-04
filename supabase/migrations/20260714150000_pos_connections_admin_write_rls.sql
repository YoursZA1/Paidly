-- Align pos_connections write RLS with API: company admins/owners (MANAGE_COMPANY_SETTINGS).
-- Safe to re-run. Fixes envs that already applied 20260709180000 with is_org_member FOR ALL.

DROP POLICY IF EXISTS "pos_connections_org_manage" ON public.pos_connections;
CREATE POLICY "pos_connections_org_manage"
  ON public.pos_connections
  FOR ALL
  TO authenticated
  USING (public.is_company_admin_for_org(org_id))
  WITH CHECK (public.is_company_admin_for_org(org_id));

-- Ensure oauth table grant exists even if earlier migration granted before table create.
DO $$
BEGIN
  IF to_regclass('public.pos_oauth_states') IS NOT NULL THEN
    EXECUTE 'GRANT ALL ON TABLE public.pos_oauth_states TO service_role';
  END IF;
END $$;
