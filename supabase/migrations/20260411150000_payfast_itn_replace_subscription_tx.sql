-- Atomic PayFast ITN path: deactivate all subscriptions for user, then insert the new row (upgrade/downgrade).
-- Called from server payfastSubscriptionItn.js via service_role RPC so deactivate + insert share one transaction.

CREATE OR REPLACE FUNCTION public.payfast_itn_replace_user_subscription(
  p_user_id uuid,
  p_new_row jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_clean jsonb;
  v_ts timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'payfast_itn_replace_user_subscription: p_user_id required';
  END IF;

  v_clean := COALESCE(p_new_row, '{}'::jsonb) - 'id';
  v_ts := COALESCE((v_clean->>'updated_at')::timestamptz, now());

  UPDATE public.subscriptions
  SET status = 'inactive', updated_at = v_ts
  WHERE user_id = p_user_id;

  INSERT INTO public.subscriptions (
    email,
    full_name,
    user_email,
    user_name,
    plan,
    current_plan,
    status,
    amount,
    custom_price,
    billing_cycle,
    next_billing_date,
    created_at,
    updated_at,
    user_id,
    start_date,
    payfast_token,
    payfast_subscription_id,
    provider,
    failure_count,
    last_payment_at,
    next_retry_at,
    dunning_stage,
    past_due_at,
    canceled_at,
    last_payment_failure_at,
    max_retry_attempts,
    retry_interval_hours
  )
  SELECT
    r.email,
    r.full_name,
    r.user_email,
    r.user_name,
    r.plan,
    r.current_plan,
    r.status,
    r.amount,
    r.custom_price,
    r.billing_cycle,
    r.next_billing_date,
    COALESCE(r.created_at, now()),
    COALESCE(r.updated_at, now()),
    COALESCE(r.user_id, p_user_id),
    r.start_date,
    r.payfast_token,
    r.payfast_subscription_id,
    COALESCE(r.provider, 'payfast'),
    COALESCE(r.failure_count, 0),
    r.last_payment_at,
    r.next_retry_at,
    COALESCE(r.dunning_stage, 0),
    r.past_due_at,
    r.canceled_at,
    r.last_payment_failure_at,
    COALESCE(r.max_retry_attempts, 3),
    COALESCE(r.retry_interval_hours, 24)
  FROM jsonb_populate_record(NULL::public.subscriptions, v_clean) AS r
  WHERE r.email IS NOT NULL AND btrim(r.email) <> ''
  RETURNING id INTO new_id;

  IF new_id IS NULL THEN
    RAISE EXCEPTION 'payfast_itn_replace_user_subscription: insert failed (email missing or invalid)';
  END IF;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.payfast_itn_replace_user_subscription(uuid, jsonb) IS
  'PayFast ITN: atomically deactivate existing user subscriptions and insert the new agreement row. Service role only.';

REVOKE ALL ON FUNCTION public.payfast_itn_replace_user_subscription(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payfast_itn_replace_user_subscription(uuid, jsonb) TO service_role;
