-- Stripe-style subscription lifecycle + dunning metadata.
-- Additive and safe for existing environments.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS dunning_stage integer NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS past_due_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_retry_attempts integer NOT NULL DEFAULT 3;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS retry_interval_hours integer NOT NULL DEFAULT 24;

CREATE INDEX IF NOT EXISTS subscriptions_status_next_billing_idx
  ON public.subscriptions (status, next_billing_date);

CREATE INDEX IF NOT EXISTS subscriptions_status_next_retry_idx
  ON public.subscriptions (status, next_retry_at);

CREATE TABLE IF NOT EXISTS public.subscription_dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  attempt_no integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_dunning_events_subscription_created_idx
  ON public.subscription_dunning_events(subscription_id, created_at DESC);

COMMENT ON TABLE public.subscription_dunning_events IS 'Audit trail for subscription retry/dunning lifecycle transitions.';
COMMENT ON COLUMN public.subscriptions.dunning_stage IS 'Current dunning stage (0=none, increments per failed retry).';
COMMENT ON COLUMN public.subscriptions.next_retry_at IS 'Next scheduled retry timestamp after payment failure.';
