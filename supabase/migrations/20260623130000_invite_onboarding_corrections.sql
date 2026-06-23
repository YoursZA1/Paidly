-- Correctness fixes for the invite / onboarding flow (F4, F5, F6).
-- Forward migration: CREATE OR REPLACE only — no existing migration is edited, matching
-- the repo's established pattern for revising handle_new_user / helper functions.

-- ── F5: persist ownership-transfer intent on the invite row ───────────────────
-- accept_company_invite_token() already honours v_meta->>'transfer_org_ownership',
-- but validate_company_invite_token() never returned it, so the shareable-link
-- acceptance path silently dropped ownership transfer for platform-admin "new company"
-- invites. Carry the intent on company_invites and surface it from validation.

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS transfer_org_ownership boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_invites.transfer_org_ownership IS
  'When true, accepting the invite transfers org ownership to the invitee (platform-admin new-company flow).';

CREATE OR REPLACE FUNCTION public.validate_company_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_invites%ROWTYPE;
  v_org_name text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_token');
  END IF;

  SELECT * INTO v_row
  FROM public.company_invites
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_row.status);
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT o.name INTO v_org_name
  FROM public.organizations o
  WHERE o.id = v_row.org_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_row.id,
    'email', v_row.email,
    'role', v_row.role,
    'org_id', v_row.org_id,
    'company_name', coalesce(v_org_name, 'your company'),
    'expires_at', v_row.expires_at,
    'transfer_org_ownership', coalesce(v_row.transfer_org_ownership, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_company_invite_token(text) TO anon, authenticated;

-- ── F4: do not auto-create a throwaway org for shareable-invite signups ───────
-- A brand-new user arriving via /invite?token= signs up normally (no Supabase
-- invited_at metadata), so handle_new_user used to create a personal "My Organization"
-- and THEN accept_company_invite_token joined them to the real org — leaving an owned
-- junk org that get_my_tenant_context preferred, landing an employee on the admin
-- dashboard. When the client signals a pending invite, skip personal-org creation; the
-- validated accept_company_invite_token() assigns the real org post-auth, and
-- ensureUserHasOrganization()/bootstrap_user_organization() backstops the rare case where
-- acceptance never completes. The flag only suppresses creation — it grants no role or
-- org — so honouring client metadata here is safe.

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
      subscription_plan, currency, timezone, role
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
      COALESCE(NEW.raw_user_meta_data->>'plan', NEW.raw_user_meta_data->>'subscription_plan', 'starter'),
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

  -- Shareable-invite signup: defer org assignment to validated token acceptance.
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ── F6: role-less users default to employee (least privilege), not company_admin ─
-- A user with no user_roles row and no owned org previously fell through to
-- 'company_admin' with a null company. RLS already returns no data for them, so the
-- only effect was admin dashboard chrome; default to employee instead.

CREATE OR REPLACE FUNCTION public.get_my_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owned_org uuid;
  v_saas_role text;
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF public.is_platform_admin() THEN
    RETURN jsonb_build_object(
      'ok', true,
      'saas_role', 'platform_admin',
      'home_route', '/admin-v2',
      'onboarding', public.get_my_onboarding_context()
    );
  END IF;

  SELECT o.id INTO v_owned_org
  FROM public.organizations o WHERE o.owner_id = v_user_id
  ORDER BY o.created_at ASC LIMIT 1;

  SELECT ur.role, ur.company_id INTO v_saas_role, v_org_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
  ORDER BY
    CASE WHEN v_owned_org IS NOT NULL AND ur.company_id = v_owned_org THEN 0 ELSE 1 END,
    CASE ur.role WHEN 'company_admin' THEN 0 ELSE 1 END,
    ur.created_at ASC
  LIMIT 1;

  IF v_saas_role IS NULL THEN
    IF v_owned_org IS NOT NULL THEN
      v_saas_role := 'company_admin';
      v_org_id := v_owned_org;
    ELSE
      v_saas_role := 'employee';
      v_org_id := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'saas_role', coalesce(v_saas_role, 'employee'),
    'company_id', v_org_id,
    'home_route', CASE WHEN coalesce(v_saas_role, 'employee') = 'employee' THEN '/EmployeeDashboard' ELSE '/Dashboard' END,
    'employee_dashboard', coalesce(v_saas_role, 'employee') = 'employee',
    'onboarding', public.get_my_onboarding_context()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_context() TO authenticated;
