-- Grace period field (past_due + grace_ends_at — never invent grace_period status).
-- plan_family on subscriptions + family-aware profile mirror.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_family text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_family_allowed'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_family_allowed
      CHECK (plan_family IS NULL OR plan_family IN ('starter', 'business', 'growth', 'enterprise'));
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.grace_ends_at IS
  'When status=past_due, access remains until this timestamp. Not a separate status.';
COMMENT ON COLUMN public.subscriptions.plan_family IS
  'Cached entitlement family from plans.plan_family (starter|business|growth|enterprise).';

-- Backfill plan_family from plan_id / plan_slug (legacy → family goodwill upgrade).
UPDATE public.subscriptions s
SET plan_family = COALESCE(
  p.plan_family,
  CASE
    WHEN lower(trim(coalesce(s.plan_slug, s.plan, s.current_plan, ''))) IN (
      'individual', 'starter', 'starter_monthly', 'starter_annual', 'free', 'basic', 'trial', 'none'
    ) THEN 'starter'
    WHEN lower(trim(coalesce(s.plan_slug, s.plan, s.current_plan, ''))) IN (
      'sme', 'business', 'business_monthly', 'business_annual', 'professional', 'pro'
    ) THEN 'business'
    WHEN lower(trim(coalesce(s.plan_slug, s.plan, s.current_plan, ''))) IN (
      'corporate', 'growth', 'growth_monthly', 'growth_annual'
    ) THEN 'growth'
    WHEN lower(trim(coalesce(s.plan_slug, s.plan, s.current_plan, ''))) IN (
      'enterprise', 'enterprise_custom'
    ) THEN 'enterprise'
    ELSE NULL
  END
)
FROM public.plans p
WHERE s.plan_id IS NOT DISTINCT FROM p.id OR (s.plan_id IS NULL AND p.slug = coalesce(s.plan_slug, s.plan));

-- Broader backfill when join missed
UPDATE public.subscriptions
SET plan_family = CASE
  WHEN lower(trim(coalesce(plan_slug, plan, current_plan, ''))) IN (
    'individual', 'starter', 'starter_monthly', 'starter_annual', 'free', 'basic', 'trial', 'none'
  ) THEN 'starter'
  WHEN lower(trim(coalesce(plan_slug, plan, current_plan, ''))) IN (
    'sme', 'business', 'business_monthly', 'business_annual', 'professional', 'pro'
  ) THEN 'business'
  WHEN lower(trim(coalesce(plan_slug, plan, current_plan, ''))) IN (
    'corporate', 'growth', 'growth_monthly', 'growth_annual'
  ) THEN 'growth'
  WHEN lower(trim(coalesce(plan_slug, plan, current_plan, ''))) IN (
    'enterprise', 'enterprise_custom'
  ) THEN 'enterprise'
  ELSE plan_family
END
WHERE plan_family IS NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_plan text;
  pl text;
  fam text;
  st text;
  prof_status text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  raw_plan := trim(coalesce(NEW.plan_slug, NEW.plan, NEW.current_plan, ''));
  IF raw_plan = '' AND NEW.plan_family IS NULL THEN
    RETURN NEW;
  END IF;

  pl := lower(raw_plan);
  fam := lower(trim(coalesce(NEW.plan_family, '')));

  -- Resolve family from slug aliases when plan_family unset
  IF fam = '' OR fam IS NULL THEN
    IF pl IN (
      'individual', 'starter', 'starter_monthly', 'starter_annual',
      'free', 'basic', 'trial', 'none', ''
    ) THEN
      fam := 'starter';
    ELSIF pl IN (
      'sme', 'business', 'business_monthly', 'business_annual',
      'professional', 'pro'
    ) THEN
      fam := 'business';
    ELSIF pl IN (
      'corporate', 'growth', 'growth_monthly', 'growth_annual'
    ) THEN
      fam := 'growth';
    ELSIF pl IN ('enterprise', 'enterprise_custom') THEN
      fam := 'enterprise';
    ELSE
      fam := 'starter';
    END IF;
  END IF;

  IF fam NOT IN ('starter', 'business', 'growth', 'enterprise') THEN
    fam := 'starter';
  END IF;

  NEW.plan_family := fam;

  -- profiles.plan stores family for FeatureGate / Layout (not cycle-specific slug)
  pl := fam;

  st := lower(trim(coalesce(NEW.status, '')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN
    st := 'cancelled';
  ELSIF st = 'paused' THEN
    st := 'suspended';
  ELSIF st = 'trial' THEN
    st := 'trialing';
  END IF;

  prof_status := CASE
    WHEN st = 'pending' THEN 'pending'
    WHEN st = 'processing' THEN 'pending'
    WHEN st = 'active' THEN 'active'
    WHEN st = 'trialing' THEN 'trial'
    WHEN st = 'past_due' THEN 'past_due'
    WHEN st = 'failed' THEN 'failed'
    WHEN st = 'cancelled' THEN 'cancelled'
    WHEN st = 'expired' THEN 'expired'
    WHEN st = 'suspended' THEN 'suspended'
    ELSE 'cancelled'
  END;

  UPDATE public.profiles
  SET
    plan = pl,
    subscription_plan = pl,
    subscription_status = prof_status,
    trial_ends_at = CASE
      WHEN prof_status IN ('active') THEN NULL
      ELSE profiles.trial_ends_at
    END,
    is_pro = (
      st IN ('active', 'trialing')
      OR (
        st = 'past_due'
        AND NEW.grace_ends_at IS NOT NULL
        AND NEW.grace_ends_at > now()
      )
    ),
    updated_at = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_from_subscription_row() IS
  'Mirror subscription → profiles. plan/subscription_plan = plan_family. is_pro includes past_due in grace.';
