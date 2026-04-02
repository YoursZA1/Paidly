-- Public affiliate apply form inserts into affiliate_applications as anon or authenticated.
-- If INSERT policies were dropped or never applied on a given project, Postgres returns:
-- "new row violates row-level security policy for table affiliate_applications".

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON TABLE public.affiliate_applications TO anon, authenticated;

DROP POLICY IF EXISTS "affiliate_applications_anon_insert" ON public.affiliate_applications;
CREATE POLICY "affiliate_applications_anon_insert"
  ON public.affiliate_applications
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "affiliate_applications_auth_insert" ON public.affiliate_applications;
CREATE POLICY "affiliate_applications_auth_insert"
  ON public.affiliate_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
