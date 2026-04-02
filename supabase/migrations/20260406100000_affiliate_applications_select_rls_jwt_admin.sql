-- affiliate_applications: fix SELECT for admins who are only flagged via JWT.
--
-- Context:
-- - `affiliate_applications_own_select` only returns rows where user_id = auth.uid()
--   (pending applications often have user_id NULL → invisible).
-- - Migration 20260402143000 replaced `affiliate_applications_admin_select` (is_admin/JWT)
--   with `affiliate_applications_team_select` (profiles.role / user_role).
-- - If app_metadata.role = 'admin' but profiles.role is not synced yet, SELECT returns 0 rows.
--
-- We intentionally do NOT use USING (true) for all authenticated users — that would expose
-- applicant PII (email, name) to every logged-in customer.
--
-- This policy restores JWT-based admin visibility alongside internal team.

DROP POLICY IF EXISTS "affiliate_applications_jwt_admin_select" ON public.affiliate_applications;

CREATE POLICY "affiliate_applications_jwt_admin_select"
  ON public.affiliate_applications
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- Explicit grant (harmless if already present): RLS still applies per policy above + team_select + own_select.
GRANT SELECT ON TABLE public.affiliate_applications TO authenticated;
