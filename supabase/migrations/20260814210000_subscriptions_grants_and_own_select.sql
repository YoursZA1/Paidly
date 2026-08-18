-- Restore subscriptions table privileges + own-row SELECT.
-- Billing v2 REVOKE'd INSERT/UPDATE/DELETE from authenticated (correct — writes stay
-- service_role / /api). SELECT grants and the user_id = auth.uid() policy were dropped
-- or never reapplied, so admin UI (JWT) and tenant billing reads fail with:
--   permission denied for table subscriptions  (SQLSTATE 42501)
--
-- Authenticated: SELECT only. Writes remain service_role (ITN, cron, /api/admin).
-- Do not GRANT INSERT/UPDATE/DELETE to authenticated.

GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

GRANT SELECT ON TABLE public.plans TO anon, authenticated;
GRANT ALL ON TABLE public.plans TO service_role;

-- Tenant billing page: own agreement rows (company_id may be null).
DROP POLICY IF EXISTS "subscriptions_user_select_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_own_user" ON public.subscriptions;

CREATE POLICY "subscriptions_user_select_own"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    user_id IS NOT NULL
    AND user_id = auth.uid()
  );

COMMENT ON POLICY "subscriptions_user_select_own" ON public.subscriptions IS
  'End-user billing: SELECT own PayFast-linked rows. Admin list/writes go through /api/admin (service_role).';
