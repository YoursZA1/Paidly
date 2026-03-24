-- Allow marketing site waitlist signups with the anon (and authenticated) Supabase key.
-- SELECT remains closed; inserts only.

CREATE POLICY "waitlist_signups_anon_insert"
  ON public.waitlist_signups
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "waitlist_signups_authenticated_insert"
  ON public.waitlist_signups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE public.waitlist_signups IS 'Marketing waitlist; public INSERT via anon key from landing, or service role from API.';
