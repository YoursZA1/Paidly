-- PayFast Recurring Billing: in-place plan changes on the existing agreement
-- (PATCH https://api.payfast.co.za/subscriptions/{token}/update) instead of a
-- second PayFast subscription. Downgrades apply at the next billing date.
-- Additive only.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_slug text,
  ADD COLUMN IF NOT EXISTS scheduled_plan_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS payfast_status_text text,
  ADD COLUMN IF NOT EXISTS payfast_synced_at timestamptz;

COMMENT ON COLUMN public.subscriptions.scheduled_plan_slug IS
  'Downgrade queued on the same PayFast token. amount already holds the new recurring amount; plan_slug keeps paid-for access until scheduled_change_at.';
COMMENT ON COLUMN public.subscriptions.payfast_status_text IS
  'Last status_text from GET /subscriptions/{token}/fetch (ACTIVE, PAUSED, CANCELLED, ...).';

CREATE INDEX IF NOT EXISTS idx_subscriptions_payfast_token
  ON public.subscriptions (payfast_token)
  WHERE payfast_token IS NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'subscription_events'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.subscription_events DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END
$$;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
    CHECK (
      event_type IS NULL
      OR event_type IN (
        'subscription_created',
        'payment_pending',
        'payment_verified',
        'payment_failed',
        'cancelled',
        'renewed',
        'webhook_received',
        'webhook_verified',
        'webhook_failed',
        'redirected',
        'activated',
        'plan_changed',
        'plan_change_scheduled'
      )
    );

CREATE OR REPLACE FUNCTION public.normalize_subscription_event_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  IF NEW.event_type IS NULL OR btrim(NEW.event_type) = '' THEN
    RAISE EXCEPTION 'subscription_events.event_type is required';
  END IF;

  t := lower(trim(NEW.event_type));
  t := replace(t, ' ', '_');

  IF t IN ('subscription_created', 'subscriptioncreated', 'created') THEN
    t := 'subscription_created';
  ELSIF t IN ('redirected', 'redirect', 'payfast_redirect') THEN
    t := 'redirected';
  ELSIF t IN ('payment_pending', 'paymentpending') THEN
    t := 'payment_pending';
  ELSIF t IN ('payment_verified', 'paymentverified', 'payment_completed', 'paymentcompleted') THEN
    t := 'payment_verified';
  ELSIF t IN ('payment_failed', 'paymentfailed') THEN
    t := 'payment_failed';
  ELSIF t IN ('activated', 'activate', 'activation') THEN
    t := 'activated';
  ELSIF t IN ('cancelled', 'canceled', 'cancel') THEN
    t := 'cancelled';
  ELSIF t IN ('renewed', 'renew') THEN
    t := 'renewed';
  ELSIF t IN ('webhook_received', 'webhookreceived', 'itn_received', 'itnreceived') THEN
    t := 'webhook_received';
  ELSIF t IN ('webhook_verified', 'webhookverified', 'itn_verified', 'itnverified', 'verified') THEN
    t := 'webhook_verified';
  ELSIF t IN ('webhook_failed', 'webhookfailed', 'itn_failed', 'itnfailed') THEN
    t := 'webhook_failed';
  ELSIF t IN ('plan_changed', 'planchanged') THEN
    t := 'plan_changed';
  ELSIF t IN ('plan_change_scheduled', 'planchangescheduled') THEN
    t := 'plan_change_scheduled';
  END IF;

  IF t NOT IN (
    'subscription_created',
    'payment_pending',
    'payment_verified',
    'payment_failed',
    'cancelled',
    'renewed',
    'webhook_received',
    'webhook_verified',
    'webhook_failed',
    'redirected',
    'activated',
    'plan_changed',
    'plan_change_scheduled'
  ) THEN
    RAISE EXCEPTION
      'invalid subscription_events.event_type "%" — allowed: subscription_created, redirected, payment_pending, payment_verified, payment_failed, activated, cancelled, renewed, webhook_received, webhook_verified, webhook_failed, plan_changed, plan_change_scheduled',
      NEW.event_type;
  END IF;

  NEW.event_type := t;
  IF NEW.details IS NULL THEN
    NEW.details := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

