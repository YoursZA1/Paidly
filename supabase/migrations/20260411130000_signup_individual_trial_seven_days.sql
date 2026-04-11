-- New signups: Individual-tier trial — plan + subscription_plan = individual, subscription_status = trial,
-- trial_ends_at = metadata override or (now + 7 days). Matches app expectation:
--   plan: individual, subscription_status: trial, trial_ends_at: +7d

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'individual';

COMMENT ON COLUMN public.profiles.plan IS
  'Billing tier slug: individual (and subscription_status=trial) during free trial; individual | sme | corporate when subscription_status=active; mirrors subscription_plan.';

-- Rows still on legacy slug `trial` from earlier defaults → Individual product trial.
UPDATE public.profiles
SET
  plan = 'individual',
  subscription_plan = 'individual'
WHERE lower(trim(coalesce(plan, ''))) = 'trial'
  AND lower(trim(coalesce(subscription_status, ''))) = 'trial';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  v_staff_role text;
  v_trial_ends timestamptz;
BEGIN
  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_staff_role IS NULL OR v_staff_role = '' OR v_staff_role NOT IN ('admin', 'management', 'sales', 'support') THEN
    v_staff_role := NULL;
  END IF;

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

  IF v_trial_ends IS NULL THEN
    v_trial_ends := (timezone('utc', now())) + interval '7 days';
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
      'individual',
      'individual',
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
      subscription_plan = COALESCE(profiles.subscription_plan, EXCLUDED.subscription_plan),
      plan = COALESCE(profiles.plan, EXCLUDED.plan),
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
