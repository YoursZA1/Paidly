-- Paidly subscription lifecycle from 2026-08-20:
--   * New org-owner accounts get a 7-day server-side trial (subscriptions.trialing).
--   * Admin overrides (admin_override / subscription_source=admin) are never auto-expired.
--   * Do NOT backfill or reset existing accounts.
--   * Invite / pending-invite signups do not receive a personal trial subscription.

-- ── Columns (additive only) ───────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_source text,
  ADD COLUMN IF NOT EXISTS admin_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_override_by uuid,
  ADD COLUMN IF NOT EXISTS admin_override_reason text;

COMMENT ON COLUMN public.subscriptions.trial_started_at IS
  'Server-side trial start. Set on new org-owner accounts from 2026-08-20; never from the browser.';
COMMENT ON COLUMN public.subscriptions.subscription_source IS
  'Who last established this agreement: system_trial | payfast | admin.';
COMMENT ON COLUMN public.subscriptions.admin_override IS
  'When true, automated trial expiry and similar jobs must not overwrite status or trial_ends_at.';

DO $$
BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_source_allowed
    CHECK (
      subscription_source IS NULL
      OR subscription_source IN ('system_trial', 'payfast', 'admin')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS subscriptions_trialing_end_idx
  ON public.subscriptions (trial_ends_at)
  WHERE status = 'trialing';

CREATE INDEX IF NOT EXISTS subscriptions_admin_override_idx
  ON public.subscriptions (admin_override)
  WHERE admin_override = true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

COMMENT ON COLUMN public.profiles.trial_started_at IS
  'Cache of the server-side trial start (SoR remains subscriptions).';

CREATE INDEX IF NOT EXISTS payment_history_completed_at_idx
  ON public.payment_history (coalesce(transaction_date, created_at))
  WHERE payment_status = 'completed';

-- ── Server-side 7-day trial for new org owners ────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_owner_system_trial(p_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := now();
  v_end timestamptz := now() + interval '7 days';
  v_cutoff timestamptz := timestamptz '2026-08-20 00:00:00+00';
  v_created timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT created_at INTO v_created FROM auth.users WHERE id = p_user_id;
  IF v_created IS NULL OR v_created < v_cutoff THEN
    RETURN;
  END IF;

  -- Never create a competing trial if any agreement already exists.
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    plan = 'starter',
    subscription_plan = 'starter',
    subscription_status = 'trial',
    trial_started_at = v_start,
    trial_ends_at = v_end,
    is_pro = true,
    updated_at = v_start
  WHERE id = p_user_id
    AND lower(trim(coalesce(subscription_status, ''))) NOT IN (
      'active', 'cancelled', 'canceled', 'past_due', 'suspended'
    );

  INSERT INTO public.subscriptions (
    user_id,
    company_id,
    created_by,
    status,
    plan,
    current_plan,
    plan_slug,
    plan_family,
    amount,
    currency,
    billing_cycle,
    trial_started_at,
    trial_ends_at,
    subscription_source,
    admin_override,
    provider,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_company_id,
    p_user_id,
    'trialing',
    'starter',
    'starter',
    'starter_monthly',
    'starter',
    0,
    'ZAR',
    'monthly',
    v_start,
    v_end,
    'system_trial',
    false,
    'system',
    v_start,
    v_start
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'start_owner_system_trial failed for user %: %', p_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.start_owner_system_trial(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_owner_system_trial(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.start_owner_system_trial(uuid, uuid) IS
  'Creates a 7-day trialing subscription for a new org owner created on/after 2026-08-20 UTC. No-op if a subscription already exists. Ignores client timestamps.';

-- ── handle_new_user: keep invite/org logic; ignore client trial dates ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  v_staff_role text;
  v_company_org_id uuid;
  v_company_role text;
  v_job_function text;
  v_invited_by uuid;
  v_onboarding_form text;
  v_is_invited boolean;
  v_transfer_ownership boolean;
  v_pending_invite boolean;
BEGIN
  v_is_invited := NEW.invited_at IS NOT NULL;

  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_staff_role IS NULL OR v_staff_role = '' OR v_staff_role NOT IN ('admin', 'management', 'sales', 'support') THEN
    v_staff_role := NULL;
  END IF;

  BEGIN
    v_company_org_id := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'company_org_id', '')), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_company_org_id := NULL;
  END;

  BEGIN
    v_invited_by := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'invited_by', '')), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_invited_by := NULL;
  END;

  v_company_role := public.normalize_company_role(COALESCE(NEW.raw_user_meta_data->>'company_role', 'employee'));
  v_job_function := public.normalize_job_function(
    COALESCE(NEW.raw_user_meta_data->>'company_job_function', NEW.raw_user_meta_data->>'job_function', 'general')
  );
  v_transfer_ownership := lower(trim(coalesce(NEW.raw_user_meta_data->>'transfer_org_ownership', ''))) IN ('true', '1', 'yes');
  v_pending_invite := lower(trim(coalesce(NEW.raw_user_meta_data->>'pending_company_invite', ''))) IN ('true', '1', 'yes');

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, avatar_url, logo_url, company_name, company_address, phone,
      subscription_plan, plan, currency, timezone, role
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
      'starter',
      'starter',
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
      currency = COALESCE(EXCLUDED.currency, profiles.currency),
      timezone = COALESCE(EXCLUDED.timezone, profiles.timezone),
      role = COALESCE(EXCLUDED.role, profiles.role),
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Profile creation failed for user %: %', NEW.id, SQLERRM;
  END;

  IF v_company_org_id IS NOT NULL AND v_is_invited THEN
    BEGIN
      IF v_transfer_ownership THEN
        v_company_role := 'owner';
      END IF;

      INSERT INTO public.memberships (org_id, user_id, role, job_function)
      VALUES (v_company_org_id, NEW.id, v_company_role, v_job_function)
      ON CONFLICT (org_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        job_function = EXCLUDED.job_function;

      v_onboarding_form := coalesce(
        nullif(lower(trim(NEW.raw_user_meta_data->>'company_onboarding_form')), ''),
        CASE
          WHEN v_transfer_ownership OR v_company_role IN ('owner', 'admin') THEN 'admin'
          ELSE 'member'
        END
      );

      PERFORM public.upsert_user_company_role(
        NEW.id,
        v_company_org_id,
        v_company_role,
        v_onboarding_form,
        v_invited_by
      );

      IF v_transfer_ownership THEN
        UPDATE public.organizations SET owner_id = NEW.id WHERE id = v_company_org_id;
      END IF;

      UPDATE public.company_invites
      SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
      WHERE org_id = v_company_org_id
        AND lower(trim(email)) = lower(trim(NEW.email))
        AND status = 'pending';

      PERFORM public.sync_saas_user_roles(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Company membership join failed for user %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
  END IF;

  IF v_pending_invite THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Organization'), NEW.id)
    RETURNING id INTO new_org_id;

    INSERT INTO public.memberships (org_id, user_id, role, job_function)
    VALUES (new_org_id, NEW.id, 'owner', 'general');

    PERFORM public.upsert_user_company_role(
      NEW.id,
      new_org_id,
      'owner',
      'admin',
      NULL
    );
    PERFORM public.sync_saas_user_roles(NEW.id);
    PERFORM public.start_owner_system_trial(NEW.id, new_org_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ── Trial expiry: skip admin overrides; expire subscriptions + profiles ───────
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

  UPDATE public.subscriptions
  SET
    status = 'expired',
    updated_at = now()
  WHERE user_id = uid
    AND lower(trim(coalesce(status, ''))) IN ('trialing', 'trial')
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    AND coalesce(admin_override, false) = false
    AND coalesce(subscription_source, '') <> 'admin';

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = profiles.id
        AND (
          coalesce(s.admin_override, false) = true
          OR coalesce(s.subscription_source, '') = 'admin'
        )
    );

  GET DIAGNOSTICS n_prof = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'expired', (n_sub + n_prof) > 0, 'rows', n_sub + n_prof);
END;
$$;

COMMENT ON FUNCTION public.expire_trial_if_due() IS
  'Authenticated caller: expire own trialing subscription/profile when trial_ends_at < now(). Skips admin_override. Does not change plan (upgrade UI keeps catalog slug).';

REVOKE ALL ON FUNCTION public.expire_trial_if_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_trial_if_due() TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_all_overdue_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_sub int := 0;
  n_prof int := 0;
BEGIN
  UPDATE public.subscriptions
  SET
    status = 'expired',
    updated_at = now()
  WHERE lower(trim(coalesce(status, ''))) IN ('trialing', 'trial')
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    AND coalesce(admin_override, false) = false
    AND coalesce(subscription_source, '') <> 'admin';

  GET DIAGNOSTICS n_sub = ROW_COUNT;

  UPDATE public.profiles
  SET
    subscription_status = 'expired',
    is_pro = false,
    updated_at = now()
  WHERE lower(trim(coalesce(subscription_status, ''))) = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = profiles.id
        AND (
          coalesce(s.admin_override, false) = true
          OR coalesce(s.subscription_source, '') = 'admin'
        )
    );

  GET DIAGNOSTICS n_prof = ROW_COUNT;
  RETURN n_sub + n_prof;
END;
$$;

COMMENT ON FUNCTION public.expire_all_overdue_trials() IS
  'Batch: expire trialing subscriptions and matching profiles past trial_ends_at. Skips admin_override. Service_role / cron only.';

REVOKE ALL ON FUNCTION public.expire_all_overdue_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_all_overdue_trials() TO service_role;

-- ── Profile mirror: keep trial dates; is_pro respects trial_ends_at ───────────
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
  trial_ok boolean;
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
  pl := fam;

  st := lower(trim(coalesce(NEW.status, '')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN
    st := 'cancelled';
  ELSIF st = 'paused' THEN
    st := 'suspended';
  ELSIF st = 'trial' THEN
    st := 'trialing';
  END IF;

  trial_ok := (
    st = 'trialing'
    AND (
      coalesce(NEW.admin_override, false) = true
      OR coalesce(NEW.subscription_source, '') = 'admin'
      OR NEW.trial_ends_at IS NULL
      OR NEW.trial_ends_at > now()
    )
  );

  prof_status := CASE
    WHEN st = 'pending' THEN 'pending'
    WHEN st = 'processing' THEN 'pending'
    WHEN st = 'active' THEN 'active'
    WHEN st = 'trialing' AND trial_ok THEN 'trial'
    WHEN st = 'trialing' THEN 'expired'
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
    trial_started_at = CASE
      WHEN st = 'trialing' THEN coalesce(NEW.trial_started_at, profiles.trial_started_at)
      ELSE profiles.trial_started_at
    END,
    trial_ends_at = CASE
      WHEN st = 'active' AND coalesce(NEW.subscription_source, '') <> 'admin' THEN NULL
      WHEN st = 'trialing' THEN NEW.trial_ends_at
      ELSE profiles.trial_ends_at
    END,
    is_pro = (
      st = 'active'
      OR trial_ok
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
  'Mirror subscription → profiles. is_pro includes unexpired trialing and past_due in grace. Admin-managed trials are not treated as expired.';
