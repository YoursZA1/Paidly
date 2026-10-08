-- Existing-user trial migration: bookkeeping columns on the existing subscriptions row, an optional
-- grace period that the existing access check honours (default none), an admin exclusion, and two
-- notification types. A company with no subscription row gets one when the admin runs the migration:
-- the same trial row signup creates, dated from the owner's sign-up.
--
-- Nothing here classifies, locks, or emails anyone. The classification runs only when an admin
-- confirms a dry run (POST /api/admin/subscriptions action trial_migration_run). Business data,
-- status, plan, billing dates, and payment records are not touched by this file or by the run.
--
-- Clients keep SELECT only on subscriptions (writes are revoked), so none of these columns can be
-- set from the browser. Idempotent.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_migration_status text,
  ADD COLUMN IF NOT EXISTS trial_migration_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_migration_previous_status text,
  ADD COLUMN IF NOT EXISTS trial_migration_notes text,
  ADD COLUMN IF NOT EXISTS migration_grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_exclusion_reason text,
  ADD COLUMN IF NOT EXISTS migration_excluded_by uuid,
  ADD COLUMN IF NOT EXISTS migration_excluded_at timestamptz;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_trial_migration_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_trial_migration_status_check CHECK (
  trial_migration_status IS NULL OR trial_migration_status IN (
    'NOT_REVIEWED',
    'MIGRATED_ACTIVE',
    'MIGRATED_ENDING_SOON',
    'MIGRATED_EXPIRED',
    'MIGRATED_SUBSCRIBED',
    'MIGRATED_FREE_ACCESS',
    'MIGRATED_SUSPENDED',
    'REQUIRES_REVIEW',
    'REVIEWED'
  )
);

COMMENT ON COLUMN public.subscriptions.trial_migration_status IS
  'Existing-user trial migration decision for this company. NULL = not reviewed. Bookkeeping only; access comes from status, dates, free access, and migration_grace_ends_at.';
COMMENT ON COLUMN public.subscriptions.migration_grace_ends_at IS
  'Migrated expired accounts keep access until this time so they can choose a plan. Suspended still denies.';
COMMENT ON COLUMN public.subscriptions.migration_excluded IS
  'Admin exclusion from the trial migration: no migration or trial emails, no automatic expiry, and access is kept until an admin removes the exclusion. Suspended still denies.';

CREATE INDEX IF NOT EXISTS subscriptions_migration_grace_ends_at_idx
  ON public.subscriptions (migration_grace_ends_at)
  WHERE migration_grace_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_trial_migration_status_idx
  ON public.subscriptions (trial_migration_status)
  WHERE trial_migration_status IS NOT NULL;

-- Same rules as 20261008193000, plus exclusion and the migration grace period ahead of the status CASE.
CREATE OR REPLACE FUNCTION public.subscription_row_has_access(s public.subscriptions, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(s.status, ''))) = 'suspended' THEN false
    WHEN coalesce(s.migration_excluded, false) THEN true
    WHEN s.migration_grace_ends_at IS NOT NULL AND s.migration_grace_ends_at > p_now THEN true
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
  'Access for one subscription row. Suspended denies. Then migration exclusion, a running migration grace period, and free access grant. Otherwise the status rules apply; finite trials expire whether or not an admin created them.';

-- Unchanged except that an excluded row is never expired automatically.
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
    AND trial_ends_at < now()
    AND NOT coalesce(migration_excluded, false);

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
  'Batch: expires overdue finite trials (admin-granted included). Indefinite admin trials, active rows, and migration-excluded rows are untouched. Service_role / cron only.';

REVOKE ALL ON FUNCTION public.expire_all_overdue_trials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_all_overdue_trials() TO service_role;

-- Migration emails. For these two types trial_ends_at holds the migration time (trial_migration_at),
-- so the system once-only index means once per migration.
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
      'EXISTING_USER_TRIAL_FOLLOWUP'
    )
  );

COMMENT ON COLUMN public.subscription_notifications.trial_ends_at IS
  'Cycle key for once-only sends: the trial end for trial emails, trial_migration_at for EXISTING_USER_* emails.';
