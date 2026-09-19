-- SECURITY: close platform-admin self-escalation (standalone fix, 2026-09-19).
--
-- Before this migration any signed-in user could:
--   1. sign up with user_metadata.role = 'admin' → handle_new_user copied it to profiles.role, or
--   2. PATCH their own profiles.role = 'admin' through PostgREST ("profile self access" is FOR ALL),
-- and public.is_platform_admin() / sync_saas_user_roles() / /api/admin/* trusted profiles.role.
-- The same self-access let users rewrite their own plan / subscription_status / is_pro / trial dates.
--
-- Fix (additive, no data changes):
--   * guard_profile_privileged_columns: end-user sessions (role authenticated/anon, not a
--     JWT app_metadata admin) cannot change role or billing-cache columns. Service role,
--     SECURITY DEFINER functions (triggers, RPCs) and JWT admins are unaffected.
--   * handle_new_user: staff role from metadata only for server-issued invites; never 'admin'.

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- Columns an end user must never set on their own profile. Compared through jsonb so
  -- the guard works whether or not optional columns (user_role, trial_started_at) exist.
  guarded text[] := ARRAY[
    'role', 'user_role',
    'plan', 'subscription_plan', 'subscription_status', 'is_pro',
    'trial_started_at', 'trial_ends_at'
  ];
  col text;
  new_j jsonb;
  old_j jsonb;
BEGIN
  -- Only direct end-user sessions are restricted. SECURITY DEFINER functions run as their
  -- owner, and the service role / auth admin are separate database roles.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(public.is_admin(), false) THEN
    RETURN NEW; -- JWT app_metadata.role = admin (server-controlled claim)
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := NULL;
    NEW.is_pro := false;
    NEW.subscription_status := 'inactive';
    NEW.plan := 'free';
    NEW.subscription_plan := 'free';
    NEW.trial_ends_at := NULL;
    RETURN NEW;
  END IF;

  new_j := to_jsonb(NEW);
  old_j := to_jsonb(OLD);
  FOREACH col IN ARRAY guarded LOOP
    IF (new_j -> col) IS DISTINCT FROM (old_j -> col) THEN
      RAISE EXCEPTION 'profiles.% is managed by Paidly and cannot be changed from the app', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_privileged_columns() IS
  'Blocks end-user sessions from changing profiles.role / user_role and billing cache columns. Service role, SECURITY DEFINER functions, and JWT app_metadata admins are exempt.';

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

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
    PERFORM public.start_owner_system_trial(NEW.id, new_org_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
