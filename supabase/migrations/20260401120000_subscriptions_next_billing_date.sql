-- Platform subscriptions (admin Subscriptions UI + SubscriptionFormDialog / base44 Subscription entity).
-- Creates the table if missing, then ensures next_billing_date exists for older partial installs.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  user_email text,
  user_name text,
  plan text,
  current_plan text,
  status text NOT NULL DEFAULT 'active',
  amount numeric,
  custom_price numeric,
  billing_cycle text DEFAULT 'monthly',
  next_billing_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;

CREATE INDEX IF NOT EXISTS subscriptions_created_at_idx ON public.subscriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_email_lower_idx ON public.subscriptions (lower(email));

COMMENT ON TABLE public.subscriptions IS 'Admin-managed subscription rows; aligns with base44 Subscription denormalize payload.';
COMMENT ON COLUMN public.subscriptions.next_billing_date IS 'Next scheduled billing date from admin UI.';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_admin_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_insert" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_update" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_delete" ON public.subscriptions;
DROP POLICY IF EXISTS "admin full access subscriptions" ON public.subscriptions;

CREATE POLICY "subscriptions_admin_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "subscriptions_admin_insert"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "subscriptions_admin_update"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "subscriptions_admin_delete"
  ON public.subscriptions FOR DELETE TO authenticated
  USING (public.is_admin());
