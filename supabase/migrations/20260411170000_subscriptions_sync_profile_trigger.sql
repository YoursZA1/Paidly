-- Keep public.profiles billing fields aligned when admin (or PayFast) writes public.subscriptions.
-- Runs as SECURITY DEFINER so profile updates succeed even if the browser sync path misses or JWT differs.

CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_plan text;
  pl text;
  st text;
  prof_status text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  raw_plan := trim(coalesce(NEW.plan, NEW.current_plan, ''));

  -- Match app logic: empty plan in DB → do not overwrite profile (avoid wiping with defaults).
  IF raw_plan = '' THEN
    RETURN NEW;
  END IF;

  pl := lower(raw_plan);
  -- Canonical Paidly tiers only (same buckets as normalizePaidPackageKey in app).
  IF pl IN ('starter', 'free', 'basic', 'trial', 'none') OR pl = '' THEN
    pl := 'individual';
  ELSIF pl IN ('professional', 'business') THEN
    pl := 'sme';
  ELSIF pl IN ('enterprise', 'pro') THEN
    pl := 'corporate';
  ELSIF pl NOT IN ('individual', 'sme', 'corporate') THEN
    pl := 'individual';
  END IF;

  st := lower(trim(coalesce(NEW.status, 'active')));
  prof_status := CASE
    WHEN st = 'active' THEN 'active'
    WHEN st = 'paused' THEN 'inactive'
    WHEN st IN ('cancelled', 'canceled') THEN 'cancelled'
    WHEN st = 'expired' THEN 'expired'
    WHEN st = 'past_due' THEN 'past_due'
    ELSE 'inactive'
  END;

  UPDATE public.profiles
  SET
    plan = pl,
    subscription_plan = pl,
    subscription_status = prof_status,
    trial_ends_at = CASE WHEN prof_status = 'active' THEN NULL ELSE profiles.trial_ends_at END,
    is_pro = (prof_status = 'active'),
    updated_at = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_from_subscription_row() IS
  'After subscriptions insert/update: mirror plan, subscription_plan, subscription_status, trial_ends_at, is_pro into profiles for that user_id.';

DROP TRIGGER IF EXISTS subscriptions_sync_profile_after_iu ON public.subscriptions;

CREATE TRIGGER subscriptions_sync_profile_after_iu
  AFTER INSERT OR UPDATE OF plan, current_plan, status, user_id
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_subscription_row();

REVOKE ALL ON FUNCTION public.sync_profile_from_subscription_row() FROM PUBLIC;
