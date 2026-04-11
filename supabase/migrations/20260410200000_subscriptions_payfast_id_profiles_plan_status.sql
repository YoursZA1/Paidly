-- Subscriptions: PayFast subscription identifier (when distinct from recurring token).
-- Profiles: `plan` (slug, default free) + `subscription_status` (default inactive); keep signup trigger in sync.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payfast_subscription_id text;

COMMENT ON COLUMN public.subscriptions.payfast_subscription_id IS
  'PayFast subscription identifier from ITN when provided; complements payfast_token.';

-- profiles.plan — app-facing slug; backfill from subscription_plan then default new rows to 'free'.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text;

UPDATE public.profiles p
SET plan = COALESCE(NULLIF(lower(trim(p.subscription_plan)), ''), 'free')
WHERE p.plan IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'free';

-- profiles.subscription_status — may exist from older migration without a default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN subscription_status text NOT NULL DEFAULT 'inactive';
  ELSE
    ALTER TABLE public.profiles
      ALTER COLUMN subscription_status SET DEFAULT 'inactive';
    UPDATE public.profiles
    SET subscription_status = 'inactive'
    WHERE subscription_status IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.plan IS 'Billing plan slug (mirrors subscription_plan for new code paths); default free.';
COMMENT ON COLUMN public.profiles.subscription_status IS 'Subscription lifecycle on profile (e.g. inactive, active, past_due).';

-- New auth users: keep plan aligned with subscription_plan; default subscription_status inactive.
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
BEGIN
  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_staff_role IS NULL OR v_staff_role = '' OR v_staff_role NOT IN ('admin', 'management', 'sales', 'support') THEN
    v_staff_role := NULL;
  END IF;

  v_sub_plan := COALESCE(NEW.raw_user_meta_data->>'plan', NEW.raw_user_meta_data->>'subscription_plan', 'starter');

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, avatar_url, logo_url, company_name, company_address, phone,
      subscription_plan, plan, subscription_status, currency, timezone, role
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
      'inactive',
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
