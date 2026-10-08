-- Trial conversion mail log + timed free access on the existing subscriptions row.
-- Does not add a status value (the CHECK allow-list stays). Access is still
-- subscription_row_has_access / hasSubscriptionAccess. Suspended still denies.
-- Apply with the rest of the billing migrations. Do not run ad hoc from the app.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS free_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_access_until timestamptz;

COMMENT ON COLUMN public.subscriptions.free_access IS
  'Complimentary access granted by an admin. true + null free_access_until is indefinite. Suspended still denies.';
COMMENT ON COLUMN public.subscriptions.free_access_until IS
  'When timed free access ends. NULL with free_access true means indefinite.';

CREATE INDEX IF NOT EXISTS subscriptions_trial_ends_at_idx
  ON public.subscriptions (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_free_access_until_idx
  ON public.subscriptions (free_access_until)
  WHERE free_access = true;

-- Keep the finite-admin-trial rules and add free access ahead of the status CASE.
CREATE OR REPLACE FUNCTION public.subscription_row_has_access(s public.subscriptions, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(s.status, ''))) = 'suspended' THEN false
    WHEN coalesce(s.free_access, false)
      AND (s.free_access_until IS NULL OR s.free_access_until > p_now) THEN true
    ELSE (
      CASE lower(trim(coalesce(s.status, '')))
        WHEN 'active' THEN true
        WHEN 'trialing' THEN (
          CASE
            WHEN s.trial_ends_at IS NOT NULL THEN s.trial_ends_at > p_now
            ELSE (coalesce(s.admin_override, false) OR coalesce(s.subscription_source, '') = 'admin')
          END
        )
        WHEN 'past_due' THEN coalesce(s.grace_ends_at > p_now, false)
        WHEN 'cancelled' THEN coalesce(coalesce(s.current_period_end, s.expires_at, s.next_billing_date) > p_now, false)
        WHEN 'canceled' THEN coalesce(coalesce(s.current_period_end, s.expires_at, s.next_billing_date) > p_now, false)
        ELSE false
      END
    )
  END;
$$;

COMMENT ON FUNCTION public.subscription_row_has_access(public.subscriptions, timestamptz) IS
  'Access for one subscription row. Free access (until a date, or indefinite when free_access_until is null) grants access unless the row is suspended. Finite trials expire whether or not an admin created them.';

CREATE TABLE IF NOT EXISTS public.subscription_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  company_id uuid,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions (id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (
    notification_type IN (
      'TRIAL_ENDING_3_DAYS',
      'TRIAL_EXPIRED',
      'TRIAL_EXPIRED_FOLLOWUP',
      'TRIAL_REACTIVATION',
      'TRIAL_EXTENDED',
      'SUBSCRIPTION_CONFIRMED'
    )
  ),
  channel text NOT NULL DEFAULT 'email',
  subject text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'admin')),
  sent_at timestamptz,
  trial_ends_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One successful send per trial cycle. Failed rows stay, so a later run can retry.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_notifications_sent_once
  ON public.subscription_notifications (subscription_id, notification_type, trial_ends_at)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS subscription_notifications_subscription_idx
  ON public.subscription_notifications (subscription_id, created_at DESC);

ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscription_notifications TO service_role;

COMMENT ON TABLE public.subscription_notifications IS
  'Trial and subscription emails. status=sent is idempotent per subscription, type, and trial_ends_at. status=failed may be retried.';
