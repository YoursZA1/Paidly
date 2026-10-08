-- Subscription lifecycle: one current agreement stays; grace expiry suspends (never deletes
-- business data); customer cancel keeps access until the paid period ends.
-- payment_history gains the billing-attempt fields the ledger was missing. Status values
-- stay on the existing allow-list (completed, not "success").

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_failure_reason text;

COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS
  'Customer cancelled. Status stays active until current_period_end, then cron sets cancelled. PayFast recurring billing is already stopped.';

COMMENT ON COLUMN public.subscriptions.last_payment_failure_reason IS
  'PayFast reason from the failed ITN, when PayFast sent one. Not a Paidly retry schedule.';

CREATE INDEX IF NOT EXISTS subscriptions_grace_suspend_idx
  ON public.subscriptions (grace_ends_at)
  WHERE status = 'past_due' AND grace_ends_at IS NOT NULL;

-- company_id is the business. payfast_payment_id is the provider reference.
-- payment_status stays pending|completed|failed|cancelled|refunded.
ALTER TABLE public.payment_history
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS plan_slug text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'payfast',
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS billing_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.payment_history.payment_type IS
  'initial or renewal. Each PayFast ITN is its own row; history is not overwritten.';

ALTER TABLE public.subscription_notifications
  DROP CONSTRAINT IF EXISTS subscription_notifications_notification_type_check;
ALTER TABLE public.subscription_notifications
  ADD CONSTRAINT subscription_notifications_notification_type_check CHECK (
    notification_type IN (
      'TRIAL_ENDING_3_DAYS',
      'TRIAL_EXPIRED',
      'TRIAL_EXPIRED_FOLLOWUP',
      'TRIAL_REACTIVATION',
      'TRIAL_EXTENDED',
      'SUBSCRIPTION_CONFIRMED',
      'EXISTING_USER_TRIAL_EXPIRED',
      'EXISTING_USER_TRIAL_FOLLOWUP',
      'PAYMENT_FAILED',
      'PAYMENT_FAILED_REMINDER'
    )
  );

CREATE OR REPLACE FUNCTION public.apply_verified_payfast_payment(
  p_subscription_id uuid,
  p_pf_payment_id text,
  p_amount numeric,
  p_currency text,
  p_payment_status text,
  p_raw jsonb,
  p_period_end timestamptz DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_payfast_token text DEFAULT NULL,
  p_payfast_subscription_id text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_event_type text DEFAULT 'payment_completed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  payment_id uuid;
  inserted boolean := false;
  st text;
  prev_status text;
  prev_started timestamptz;
  prev_user uuid;
  prev_plan text;
  prev_period_start timestamptz;
  pay_type text;
BEGIN
  IF p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription_id required';
  END IF;

  st := lower(trim(coalesce(p_status, 'active')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN st := 'cancelled';
  ELSIF st = 'paused' THEN st := 'suspended';
  ELSIF st = 'trial' THEN st := 'trialing';
  END IF;

  IF p_pf_payment_id IS NOT NULL AND btrim(p_pf_payment_id) <> '' THEN
    SELECT id INTO existing_id
    FROM public.payment_history
    WHERE payfast_payment_id = btrim(p_pf_payment_id)
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'payment_history_id', existing_id
      );
    END IF;
  END IF;

  SELECT status, started_at, user_id, plan_slug, current_period_start
    INTO prev_status, prev_started, prev_user, prev_plan, prev_period_start
  FROM public.subscriptions
  WHERE id = p_subscription_id;

  pay_type := CASE
    WHEN lower(coalesce(prev_status, '')) IN ('active', 'past_due', 'suspended') THEN 'renewal'
    ELSE 'initial'
  END;

  BEGIN
    INSERT INTO public.payment_history (
      subscription_id,
      company_id,
      user_id,
      plan_slug,
      provider,
      payment_type,
      amount,
      currency,
      payfast_payment_id,
      payment_status,
      payment_method,
      raw_itn,
      transaction_date,
      attempted_at,
      completed_at,
      billing_period_start,
      billing_period_end,
      metadata
    )
    VALUES (
      p_subscription_id,
      p_company_id,
      prev_user,
      prev_plan,
      'payfast',
      pay_type,
      p_amount,
      COALESCE(NULLIF(upper(btrim(p_currency)), ''), 'ZAR'),
      NULLIF(btrim(p_pf_payment_id), ''),
      COALESCE(NULLIF(btrim(p_payment_status), ''), 'completed'),
      'payfast',
      p_raw,
      now(),
      now(),
      now(),
      COALESCE(prev_period_start, now()),
      COALESCE(p_period_end, now()),
      jsonb_build_object('previous_status', prev_status, 'previous_started_at', prev_started)
    )
    RETURNING id INTO payment_id;
    inserted := true;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO payment_id
      FROM public.payment_history
      WHERE payfast_payment_id = btrim(p_pf_payment_id)
      LIMIT 1;
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'payment_history_id', payment_id
      );
  END;

  UPDATE public.subscriptions
  SET
    status = st,
    amount = COALESCE(p_amount, amount),
    currency = COALESCE(NULLIF(upper(btrim(p_currency)), ''), currency),
    payfast_token = COALESCE(NULLIF(btrim(p_payfast_token), ''), payfast_token),
    payfast_subscription_id = COALESCE(NULLIF(btrim(p_payfast_subscription_id), ''), payfast_subscription_id),
    payfast_payment_id = COALESCE(NULLIF(btrim(p_pf_payment_id), ''), payfast_payment_id),
    current_period_start = now(),
    current_period_end = COALESCE(p_period_end, current_period_end),
    next_billing_date = COALESCE(p_period_end, next_billing_date),
    started_at = COALESCE(started_at, now()),
    activated_at = COALESCE(activated_at, now()),
    last_payment_at = now(),
    failure_count = 0,
    dunning_stage = 0,
    grace_ends_at = NULL,
    past_due_at = NULL,
    next_retry_at = NULL,
    last_payment_failure_at = NULL,
    last_payment_failure_reason = NULL,
    cancel_at_period_end = false,
    updated_at = now()
  WHERE id = p_subscription_id;

  BEGIN
    INSERT INTO public.subscription_events (
      subscription_id,
      company_id,
      event_type,
      source,
      details
    )
    VALUES (
      p_subscription_id,
      p_company_id,
      COALESCE(NULLIF(btrim(p_event_type), ''), 'payment_verified'),
      'payfast_itn',
      jsonb_build_object(
        'payfast_payment_id', p_pf_payment_id,
        'amount', p_amount,
        'currency', p_currency,
        'payment_type', pay_type
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'inserted', inserted,
    'payment_history_id', payment_id,
    'payment_type', pay_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_payfast_payment(
  uuid, text, numeric, text, text, jsonb, timestamptz, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_verified_payfast_payment(
  uuid, text, numeric, text, text, jsonb, timestamptz, text, text, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.apply_verified_payfast_payment IS
  'Atomic ITN apply. Duplicate pf_payment_id returns success and does not extend the period again. Service role only.';
