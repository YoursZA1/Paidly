-- Allow admins to read/update/delete waitlist rows in the dashboard; track conversion in-app.
ALTER TABLE public.waitlist_signups
  ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.waitlist_signups.converted IS 'Set true when the lead becomes a paying or registered user (admin UI).';

DROP POLICY IF EXISTS "waitlist_signups_admin_select" ON public.waitlist_signups;
DROP POLICY IF EXISTS "waitlist_signups_admin_update" ON public.waitlist_signups;
DROP POLICY IF EXISTS "waitlist_signups_admin_delete" ON public.waitlist_signups;

CREATE POLICY "waitlist_signups_admin_select"
  ON public.waitlist_signups FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "waitlist_signups_admin_update"
  ON public.waitlist_signups FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "waitlist_signups_admin_delete"
  ON public.waitlist_signups FOR DELETE TO authenticated
  USING (public.is_admin());
