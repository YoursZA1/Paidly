-- Finite admin trials must expire (2026-09-23). Functions only — no schema change.
--
-- admin_override / subscription_source = 'admin' mean "automation must not overwrite what the
-- administrator decided". They never meant "ignore the end date the administrator chose".
-- Mirrors shared/subscriptionAccess.js (isTrialCurrentlyValid / shouldExpireTrialRow):
--
--   trialing + trial_ends_at in the future            → access
--   trialing + trial_ends_at in the past              → NO access, and automation expires it,
--                                                       including admin-granted trials
--   trialing + no trial_ends_at + admin-managed       → indefinite admin trial, never expired
--   trialing + no trial_ends_at + not admin-managed   → no access (no open-ended self-serve trial)
--
-- Indefinite administrative access is status = 'active' with trial_ends_at NULL; nothing here
-- touches active rows.

CREATE OR REPLACE FUNCTION public.subscription_row_has_access(s public.subscriptions, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE lower(trim(coalesce(s.status, '')))
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
  END;
$$;

COMMENT ON FUNCTION public.subscription_row_has_access(public.subscriptions, timestamptz) IS
  'Access for one subscription row. Finite trials expire whether or not an admin created them; only an admin-managed trial with no trial_ends_at is indefinite.';

-- ── Per-user expiry (called by the SPA) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_trial_if_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n_sub int := 0;
  n_prof int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Finite trials only (trial_ends_at NOT NULL): an indefinite admin trial is never expired here.
  UPDATE public.subscriptions
  SET
    status = 'expired',
    updated_at = now()
  WHERE user_id = uid
    AND lower(trim(coalesce(status, ''))) IN ('trialing', 'trial')
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  GET DIAGNOSTICS n_sub = ROW_COUNT;

  UPDATE public.profiles
  SET
    subscription_status = 'expired',
    is_pro = false,
    updated_at = now()
  WHERE id = uid
    AND lower(trim(coalesce(subscription_status, ''))) = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    -- Keep the mirror only when an indefinite admin agreement still grants access.
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = profiles.id
        AND public.subscription_row_has_access(s)
    );

  GET DIAGNOSTICS n_prof = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'expired', (n_sub + n_prof) > 0, 'rows', n_sub + n_prof);
END;
$$;

COMMENT ON FUNCTION public.expire_trial_if_due() IS
  'Expires the caller''s overdue finite trials (admin-granted included). Indefinite admin trials (no trial_ends_at) are untouched.';

REVOKE ALL ON FUNCTION public.expire_trial_if_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_trial_if_due() TO authenticated;

-- ── Batch expiry (cron / service_role) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_all_overdue_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_sub int := 0;
BEGIN
  UPDATE public.subscriptions
  SET
    status = 'expired',
    updated_at = now()
  WHERE lower(trim(coalesce(status, ''))) IN ('trialing', 'trial')
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  GET DIAGNOSTICS n_sub = ROW_COUNT;

  -- Profiles are a mirror; the subscriptions trigger re-syncs each affected company.
  UPDATE public.profiles p
  SET
    subscription_status = 'expired',
    is_pro = false,
    updated_at = now()
  WHERE lower(trim(coalesce(p.subscription_status, ''))) = 'trial'
    AND p.trial_ends_at IS NOT NULL
    AND p.trial_ends_at < now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = p.id
        AND public.subscription_row_has_access(s)
    );

  RETURN n_sub;
END;
$$;

COMMENT ON FUNCTION public.expire_all_overdue_trials() IS
  'Batch: expires overdue finite trials (admin-granted included). Indefinite admin trials and active rows are untouched. Service_role / cron only.';

REVOKE ALL ON FUNCTION public.expire_all_overdue_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_all_overdue_trials() TO service_role;
