-- PayFast subscription lifecycle fields (tokenized recurring billing).
-- Safe additive migration for existing environments.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payfast_token text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'payfast';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;

COMMENT ON COLUMN public.subscriptions.payfast_token IS 'Recurring billing token returned by PayFast ITN for this subscription.';
COMMENT ON COLUMN public.subscriptions.provider IS 'Billing provider slug (e.g. payfast).';
COMMENT ON COLUMN public.subscriptions.failure_count IS 'Consecutive failed recurring billing attempts.';
COMMENT ON COLUMN public.subscriptions.last_payment_at IS 'Most recent successful recurring billing confirmation timestamp.';
