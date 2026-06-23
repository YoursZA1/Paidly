-- Invite lifecycle: mark invites accepted on auth signup, company-admin onboarding form, org ownership transfer.

CREATE OR REPLACE FUNCTION public.accept_company_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_meta jsonb;
  v_invite_id uuid;
  v_org_id uuid;
  v_role text;
  v_membership_role text;
  v_email text;
  v_onboarding_form text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_meta := public.validate_company_invite_token(p_token);
  IF (v_meta->>'ok')::boolean IS NOT TRUE THEN
    RETURN v_meta;
  END IF;

  v_invite_id := (v_meta->>'invite_id')::uuid;
  v_org_id := (v_meta->>'org_id')::uuid;
  v_role := lower(trim(v_meta->>'role'));

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL OR v_email <> lower(trim(v_meta->>'email')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_membership_role := CASE
    WHEN v_role IN ('admin', 'owner', 'company_admin') THEN 'admin'
    WHEN v_role = 'manager' THEN 'manager'
    ELSE 'employee'
  END;

  v_onboarding_form := CASE
    WHEN v_membership_role IN ('admin', 'owner') THEN 'admin'
    ELSE 'member'
  END;

  IF EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = v_org_id AND m.user_id = v_user_id
  ) THEN
    UPDATE public.memberships
    SET role = v_membership_role
    WHERE org_id = v_org_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.memberships (org_id, user_id, role, job_function)
    VALUES (v_org_id, v_user_id, v_membership_role, 'general');
  END IF;

  IF coalesce((v_meta->>'transfer_org_ownership')::boolean, false) THEN
    UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;
    UPDATE public.memberships SET role = 'owner' WHERE org_id = v_org_id AND user_id = v_user_id;
    v_onboarding_form := 'admin';
  END IF;

  PERFORM public.upsert_user_company_role(
    v_user_id, v_org_id, public.normalize_company_role(v_membership_role), v_onboarding_form, NULL
  );
  PERFORM public.sync_saas_user_roles(v_user_id);

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'org_id', v_org_id, 'role', v_membership_role);
END;
$$;

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

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'company_admin';

COMMENT ON COLUMN public.company_invites.source IS
  'Who issued the invite: company_admin | platform_admin';
