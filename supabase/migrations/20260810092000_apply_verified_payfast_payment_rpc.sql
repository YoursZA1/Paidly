-- Atomic verified PayFast payment apply (subscription + payment_history + event).
-- Replaces non-atomic steps 10–12 in payfastItnPipeline.js. Service role only.

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
BEGIN
  IF p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription_id required';
  END IF;

  st := lower(trim(coalesce(p_status, 'active')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN st := 'cancelled';
  ELSIF st = 'paused' THEN st := 'suspended';
  ELSIF st = 'trial' THEN st := 'trialing';
  END IF;

  -- Idempotency: unique payfast_payment_id
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

  UPDATE public.subscriptions
  SET
    status = st,
    amount = COALESCE(p_amount, amount),
    currency = COALESCE(NULLIF(upper(btrim(p_currency)), ''), currency),
    payfast_token = COALESCE(NULLIF(btrim(p_payfast_token), ''), payfast_token),
    payfast_subscription_id = COALESCE(NULLIF(btrim(p_payfast_subscription_id), ''), payfast_subscription_id),
    payfast_payment_id = COALESCE(NULLIF(btrim(p_pf_payment_id), ''), payfast_payment_id),
    current_period_end = COALESCE(p_period_end, current_period_end),
    next_billing_date = COALESCE(p_period_end, next_billing_date),
    activated_at = COALESCE(activated_at, now()),
    last_payment_at = now(),
    failure_count = 0,
    grace_ends_at = NULL,
    updated_at = now()
  WHERE id = p_subscription_id;

  BEGIN
    INSERT INTO public.payment_history (
      subscription_id,
      company_id,
      amount,
      currency,
      payfast_payment_id,
      payment_status,
      payment_method,
      raw_itn,
      transaction_date
    )
    VALUES (
      p_subscription_id,
      p_company_id,
      p_amount,
      COALESCE(NULLIF(upper(btrim(p_currency)), ''), 'ZAR'),
      NULLIF(btrim(p_pf_payment_id), ''),
      COALESCE(NULLIF(btrim(p_payment_status), ''), 'completed'),
      'payfast',
      p_raw,
      now()
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
      COALESCE(NULLIF(btrim(p_event_type), ''), 'payment_completed'),
      'payfast_itn',
      jsonb_build_object(
        'payfast_payment_id', p_pf_payment_id,
        'amount', p_amount,
        'currency', p_currency
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Event allow-list may reject; do not roll back payment
      NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'inserted', inserted,
    'payment_history_id', payment_id
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
  'Atomic ITN apply: update subscription + insert payment_history (idempotent) + event. Service role only.';
