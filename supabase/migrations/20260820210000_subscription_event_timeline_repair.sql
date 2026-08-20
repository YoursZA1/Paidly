-- Repair Event Timeline allow-list for databases that already applied the
-- incomplete 20260715180000 migration (leftover inline event_type CHECK,
-- missing search_path, trigger not recreated). Safe to re-run.

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

DO $$
BEGIN
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
          'activated'
        )
      );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.subscription_events.event_type IS
  'Allowed: subscription_created, redirected, payment_pending, webhook_received, webhook_verified, activated, payment_verified, payment_failed, renewed, cancelled, webhook_failed. Timeline labels: Created → Redirected → ITN Received → Verified → Activated → Renewed → Cancelled.';

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
    'activated'
  ) THEN
    RAISE EXCEPTION
      'invalid subscription_events.event_type "%" — allowed: subscription_created, redirected, payment_pending, payment_verified, payment_failed, activated, cancelled, renewed, webhook_received, webhook_verified, webhook_failed',
      NEW.event_type;
  END IF;

  NEW.event_type := t;
  IF NEW.details IS NULL THEN
    NEW.details := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_event_type ON public.subscription_events;
CREATE TRIGGER trg_normalize_subscription_event_type
  BEFORE INSERT OR UPDATE OF event_type ON public.subscription_events
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_subscription_event_type();
