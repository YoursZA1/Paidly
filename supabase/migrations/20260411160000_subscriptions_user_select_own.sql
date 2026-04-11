-- Allow authenticated users to read their own platform subscription rows (billing history UI).
-- Admins retain full access via existing `subscriptions_admin_select` (OR with this policy).

DROP POLICY IF EXISTS "subscriptions_user_select_own" ON public.subscriptions;

CREATE POLICY "subscriptions_user_select_own"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    user_id IS NOT NULL
    AND user_id = auth.uid()
  );

COMMENT ON POLICY "subscriptions_user_select_own" ON public.subscriptions IS
  'End-user billing page: list PayFast-linked subscription rows for the signed-in user only.';
