-- Canonical plan entitlements (2026-09-21). See docs/PLAN_ENTITLEMENT_AUDIT.md.
--
-- The company subscription is the only billing source of truth. profiles.plan / subscription_plan /
-- subscription_status / is_pro / trial_* become a display mirror of the company's ACCESS row — the
-- same row server/src/billing/entitlements.js picks (shared/subscriptionAccess.js
-- pickAccessSubscriptionRow) — written to every member of the company, not only the row's user_id.
--
-- 1. company_access_subscription(company, user): the access row, same ranking as the server.
-- 2. sync_profile_from_subscription_row(): mirror that row (not whichever row was written last, so a
--    pending checkout or failed row no longer overwrites the package), to all members.
--    Trigger now also fires on plan_slug / plan_family / trial / grace / company changes.
-- 3. start_owner_system_trial(user, company, plan): trial of the package selected at signup.
-- 4. handle_new_user(): passes the signup plan (unchanged otherwise from 20260919160000).
--
-- No data is rewritten here. Existing profiles are re-mirrored only by
-- supabase/scripts/plan_reconciliation_apply.sql, after reviewing plan_reconciliation_report.sql.

CREATE OR REPLACE FUNCTION public.normalize_plan_family(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN v IN ('starter', 'business', 'growth', 'enterprise') THEN v
    WHEN v IN ('individual', 'free', 'basic', 'trial', 'none', 'starter_monthly', 'starter_annual') THEN 'starter'
    WHEN v IN ('sme', 'professional', 'pro', 'business_monthly', 'business_annual') THEN 'business'
    WHEN v IN ('corporate', 'growth_monthly', 'growth_annual') THEN 'growth'
    WHEN v IN ('enterprise_custom') THEN 'enterprise'
    ELSE NULL
  END
  FROM (SELECT lower(trim(coalesce(p_raw, ''))) AS v) s;
$$;

COMMENT ON FUNCTION public.normalize_plan_family(text) IS
  'Plan slug/alias → family (starter|business|growth|enterprise) or NULL. Mirrors shared/plans.js familyForSlug.';

-- Mirrors shared/subscriptionAccess.js hasSubscriptionAccess().
CREATE OR REPLACE FUNCTION public.subscription_row_has_access(s public.subscriptions, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE lower(trim(coalesce(s.status, '')))
    WHEN 'active' THEN true
    WHEN 'trialing' THEN (
      coalesce(s.admin_override, false)
      OR coalesce(s.subscription_source, '') = 'admin'
      OR s.trial_ends_at IS NULL
      OR s.trial_ends_at > p_now
    )
    WHEN 'past_due' THEN coalesce(s.grace_ends_at > p_now, false)
    WHEN 'cancelled' THEN coalesce(coalesce(s.current_period_end, s.expires_at, s.next_billing_date) > p_now, false)
    WHEN 'canceled' THEN coalesce(coalesce(s.current_period_end, s.expires_at, s.next_billing_date) > p_now, false)
    ELSE false
  END;
$$;

-- Mirrors shared/subscriptionAccess.js pickAccessSubscriptionRow() (company first, else user).
CREATE OR REPLACE FUNCTION public.company_access_subscription(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.*
  FROM public.subscriptions s
  WHERE (p_company_id IS NOT NULL AND s.company_id = p_company_id)
     OR (p_company_id IS NULL AND p_user_id IS NOT NULL AND s.user_id = p_user_id)
  ORDER BY
    CASE
      WHEN public.subscription_row_has_access(s) AND lower(s.status) = 'active' THEN 100
      WHEN public.subscription_row_has_access(s) AND lower(s.status) = 'trialing' THEN 90
      WHEN public.subscription_row_has_access(s) AND lower(s.status) = 'past_due' THEN 80
      WHEN public.subscription_row_has_access(s) AND lower(s.status) IN ('cancelled', 'canceled') THEN 70
      WHEN lower(s.status) IN ('pending', 'processing') THEN 20
      WHEN lower(s.status) = 'expired' THEN 10
      ELSE 0
    END DESC,
    coalesce(s.updated_at, s.created_at) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.company_access_subscription(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_access_subscription(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.company_access_subscription(uuid, uuid) IS
  'The subscription row that decides a company''s package and access. Same ranking as pickAccessSubscriptionRow (server entitlements).';

-- Mirror one company's access row into every member's profile (display-only compatibility data).
CREATE OR REPLACE FUNCTION public.mirror_company_plan_to_profiles(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.subscriptions;
  fam text;
  st text;
  v_access boolean;
  prof_status text;
BEGIN
  s := public.company_access_subscription(p_company_id, p_user_id);
  IF s.id IS NULL THEN
    RETURN;
  END IF;

  fam := coalesce(
    public.normalize_plan_family(s.plan_family),
    public.normalize_plan_family(s.plan_slug),
    public.normalize_plan_family(s.plan),
    public.normalize_plan_family(s.current_plan),
    'starter'
  );
  st := lower(trim(coalesce(s.status, '')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN st := 'cancelled'; END IF;
  IF st = 'paused' THEN st := 'suspended'; END IF;
  IF st = 'trial' THEN st := 'trialing'; END IF;
  v_access := public.subscription_row_has_access(s);

  prof_status := CASE
    WHEN st IN ('pending', 'processing') THEN 'pending'
    WHEN st = 'active' THEN 'active'
    WHEN st = 'trialing' AND v_access THEN 'trial'
    WHEN st = 'trialing' THEN 'expired'
    WHEN st = 'past_due' THEN 'past_due'
    WHEN st = 'failed' THEN 'failed'
    WHEN st = 'cancelled' THEN 'cancelled'
    WHEN st = 'expired' THEN 'expired'
    WHEN st = 'suspended' THEN 'suspended'
    ELSE 'cancelled'
  END;

  UPDATE public.profiles p
  SET
    plan = fam,
    subscription_plan = fam,
    subscription_status = prof_status,
    trial_started_at = CASE WHEN st = 'trialing' THEN coalesce(s.trial_started_at, p.trial_started_at) ELSE p.trial_started_at END,
    trial_ends_at = CASE
      WHEN st = 'trialing' THEN s.trial_ends_at
      WHEN st = 'active' AND coalesce(s.subscription_source, '') <> 'admin' THEN NULL
      ELSE p.trial_ends_at
    END,
    is_pro = v_access,
    updated_at = now()
  WHERE p.id IN (
    SELECT o.owner_id FROM public.organizations o WHERE p_company_id IS NOT NULL AND o.id = p_company_id
    UNION
    SELECT m.user_id FROM public.memberships m WHERE p_company_id IS NOT NULL AND m.org_id = p_company_id AND m.user_id IS NOT NULL
    UNION
    SELECT p_user_id WHERE p_company_id IS NULL AND p_user_id IS NOT NULL
  )
  AND (
    p.plan IS DISTINCT FROM fam
    OR p.subscription_plan IS DISTINCT FROM fam
    OR p.subscription_status IS DISTINCT FROM prof_status
    OR p.is_pro IS DISTINCT FROM v_access
    OR (st = 'trialing' AND p.trial_ends_at IS DISTINCT FROM s.trial_ends_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_company_plan_to_profiles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mirror_company_plan_to_profiles(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.mirror_company_plan_to_profiles(uuid, uuid) IS
  'Writes the company access subscription (plan family + status) into every member profile. Display mirror only — never used for authorization.';

CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Mirror the company's access row, not NEW: a pending checkout or failed row must not
  -- overwrite the package while another row still decides access.
  PERFORM public.mirror_company_plan_to_profiles(NEW.company_id, CASE WHEN NEW.company_id IS NULL THEN NEW.user_id END);
  IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
    PERFORM public.mirror_company_plan_to_profiles(OLD.company_id, NULL);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- The mirror is display data; never fail a billing write because of it.
  RAISE WARNING 'sync_profile_from_subscription_row failed for subscription %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_from_subscription_row() IS
  'After subscriptions write: re-mirror the company access row (company_access_subscription) into all member profiles. Display only.';

DROP TRIGGER IF EXISTS subscriptions_sync_profile_after_iu ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_profile_after_iu
  AFTER INSERT OR UPDATE OF
    plan, current_plan, plan_slug, plan_family, status, user_id, company_id,
    trial_ends_at, trial_started_at, grace_ends_at, admin_override, subscription_source,
    current_period_end, expires_at
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_subscription_row();

REVOKE ALL ON FUNCTION public.sync_profile_from_subscription_row() FROM PUBLIC;

-- ── Trial of the package selected at signup ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.start_owner_system_trial(uuid, uuid);

CREATE OR REPLACE FUNCTION public.start_owner_system_trial(
  p_user_id uuid,
  p_company_id uuid,
  p_plan text DEFAULT 'starter'
)
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
  v_family text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT created_at INTO v_created FROM auth.users WHERE id = p_user_id;
  IF v_created IS NULL OR v_created < v_cutoff THEN
    RETURN;
  END IF;

  -- Never create a competing trial if any agreement already exists for the user or company.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user_id OR (p_company_id IS NOT NULL AND company_id = p_company_id)
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- Self-serve trial packages only; Enterprise is contact-sales and unknown values fall back.
  v_family := public.normalize_plan_family(p_plan);
  IF v_family IS NULL OR v_family NOT IN ('starter', 'business', 'growth') THEN
    v_family := 'starter';
  END IF;

  INSERT INTO public.subscriptions (
    user_id, company_id, created_by, status,
    plan, current_plan, plan_slug, plan_family,
    amount, currency, billing_cycle,
    trial_started_at, trial_ends_at,
    subscription_source, admin_override, provider,
    created_at, updated_at
  ) VALUES (
    p_user_id, p_company_id, p_user_id, 'trialing',
    v_family, v_family, v_family || '_monthly', v_family,
    0, 'ZAR', 'monthly',
    v_start, v_end,
    'system_trial', false, 'system',
    v_start, v_start
  );
  -- Profiles are mirrored by subscriptions_sync_profile_after_iu.
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'start_owner_system_trial failed for user %: %', p_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.start_owner_system_trial(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_owner_system_trial(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.start_owner_system_trial(uuid, uuid, text) IS
  '7-day trialing subscription of the package selected at signup (starter|business|growth) for a new org owner created on/after 2026-08-20 UTC. No-op if the user or company already has a subscription.';

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

  -- Staff role from metadata ONLY for server-issued invites (auth.admin.inviteUserByEmail sets
  -- invited_at; a public signUp cannot). 'admin' is never accepted from metadata — platform
  -- admin is granted server-side via app_metadata. Public signups get no staff role.
  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF NOT v_is_invited
     OR v_staff_role IS NULL
     OR v_staff_role = ''
     OR v_staff_role NOT IN ('management', 'sales', 'support') THEN
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
    -- Trial of the package chosen at signup (Starter/Business/Growth; anything else → Starter).
    PERFORM public.start_owner_system_trial(NEW.id, new_org_id, NEW.raw_user_meta_data->>'plan');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
