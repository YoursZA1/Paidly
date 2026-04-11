-- Trial auto-expiry: transition trial → expired when trial_ends_at has passed.
-- Per-user RPC (JWT): called on app load. Batch function for service_role / scheduled jobs.

CREATE OR REPLACE FUNCTION public.expire_trial_if_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  UPDATE public.profiles
  SET
    subscription_status = 'expired',
    plan = 'free',
    subscription_plan = 'free',
    updated_at = now()
  WHERE id = uid
    AND lower(trim(coalesce(subscription_status, ''))) = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'expired', n > 0, 'rows', n);
END;
$$;

COMMENT ON FUNCTION public.expire_trial_if_due() IS
  'Authenticated caller: if own profile is trial and trial_ends_at < now(), set subscription_status=expired and plan/subscription_plan=free.';

REVOKE ALL ON FUNCTION public.expire_trial_if_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_trial_if_due() TO authenticated;

-- Backend / pg_cron: expire all overdue trials (service_role only).
CREATE OR REPLACE FUNCTION public.expire_all_overdue_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.profiles
  SET
    subscription_status = 'expired',
    plan = 'free',
    subscription_plan = 'free',
    updated_at = now()
  WHERE lower(trim(coalesce(subscription_status, ''))) = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.expire_all_overdue_trials() IS
  'Batch: set subscription_status=expired and plan/subscription_plan=free for every trial past trial_ends_at. Use service_role (cron / Edge Function), not anon.';

REVOKE ALL ON FUNCTION public.expire_all_overdue_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_all_overdue_trials() TO service_role;
