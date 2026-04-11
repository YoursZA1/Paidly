-- Trial-first profiles: defaults + trial_ends_at + signup trigger.
--
-- subscription_status (lifecycle):
--   trial     — free trial
--   active    — paid subscription in good standing
--   expired   — trial ended without converting
--   cancelled — user stopped / churned (set from billing jobs or admin; legacy rows may still show inactive)
--
-- plan: use slug `trial` during free trial; paid tiers remain individual | sme | corporate (mirrors subscription_plan).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.profiles.trial_ends_at IS
  'When the free trial ends (timestamptz). NULL if not applicable or unknown.';

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'trial';

ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'trial';

-- Legacy rows that never activated billing: align with trial model.
UPDATE public.profiles
SET plan = 'trial'
WHERE lower(trim(coalesce(plan, ''))) IN ('free', 'starter', '');

UPDATE public.profiles
SET subscription_status = 'trial'
WHERE lower(trim(coalesce(subscription_status, ''))) = 'inactive'
  AND lower(trim(coalesce(plan, ''))) IN ('trial', 'free', 'starter', '');

COMMENT ON COLUMN public.profiles.plan IS
  'Billing tier slug: trial during free trial; individual | sme | corporate when paid (kept in sync with subscription_plan).';

COMMENT ON COLUMN public.profiles.subscription_status IS
  'Lifecycle: trial (free trial), active (paid), expired (trial ended), cancelled (user stopped).';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  v_staff_role text;
  v_sub_plan text;
  v_trial_ends timestamptz;
BEGIN
  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_staff_role IS NULL OR v_staff_role = '' OR v_staff_role NOT IN ('admin', 'management', 'sales', 'support') THEN
    v_staff_role := NULL;
  END IF;

  v_sub_plan := COALESCE(
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'plan', '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'subscription_plan', '')), ''),
    'trial'
  );

  v_trial_ends := NULL;
  IF (NEW.raw_user_meta_data->>'trial_ends_at') IS NOT NULL
     AND trim(COALESCE(NEW.raw_user_meta_data->>'trial_ends_at', '')) <> '' THEN
    BEGIN
      v_trial_ends := (trim(NEW.raw_user_meta_data->>'trial_ends_at'))::timestamptz;
    EXCEPTION
      WHEN OTHERS THEN
        v_trial_ends := NULL;
    END;
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, avatar_url, logo_url, company_name, company_address, phone,
      subscription_plan, plan, subscription_status, trial_ends_at, currency, timezone, role
    )
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'logo_url',
      NEW.raw_user_meta_data->>'company_name',
      NEW.raw_user_meta_data->>'company_address',
      NEW.raw_user_meta_data->>'phone',
      v_sub_plan,
      v_sub_plan,
      'trial',
      v_trial_ends,
      COALESCE(NEW.raw_user_meta_data->>'currency', 'USD'),
      COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
      v_staff_role
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      logo_url = COALESCE(EXCLUDED.logo_url, profiles.logo_url),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
      company_address = COALESCE(EXCLUDED.company_address, profiles.company_address),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      subscription_plan = COALESCE(EXCLUDED.subscription_plan, profiles.subscription_plan),
      plan = COALESCE(EXCLUDED.plan, profiles.plan),
      subscription_status = COALESCE(profiles.subscription_status, EXCLUDED.subscription_status),
      trial_ends_at = COALESCE(profiles.trial_ends_at, EXCLUDED.trial_ends_at),
      currency = COALESCE(EXCLUDED.currency, profiles.currency),
      timezone = COALESCE(EXCLUDED.timezone, profiles.timezone),
      role = COALESCE(EXCLUDED.role, profiles.role),
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Profile creation failed for user %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Organization'), NEW.id)
    RETURNING id INTO new_org_id;

    INSERT INTO public.memberships (org_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
