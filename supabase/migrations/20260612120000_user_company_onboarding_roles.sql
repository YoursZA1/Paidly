-- Company onboarding roles: assigned at signup by handle_new_user (invite metadata or org owner).
-- Users cannot self-elevate; only admins assign roles via invite API or org creation trigger.

CREATE TABLE IF NOT EXISTS public.user_company_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_role text NOT NULL DEFAULT 'employee',
  onboarding_form text NOT NULL DEFAULT 'member',
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id),
  CONSTRAINT user_company_roles_onboarding_form_check
    CHECK (onboarding_form IN ('admin', 'member')),
  CONSTRAINT user_company_roles_company_role_check
    CHECK (company_role IN ('owner', 'admin', 'manager', 'employee', 'member'))
);

COMMENT ON TABLE public.user_company_roles IS
  'Authoritative company role + onboarding form kind per user/org. Written by signup trigger and admin invite flows only.';

CREATE INDEX IF NOT EXISTS user_company_roles_user_id_idx ON public.user_company_roles (user_id);

ALTER TABLE public.user_company_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_company_roles_select_own" ON public.user_company_roles;
CREATE POLICY "user_company_roles_select_own"
  ON public.user_company_roles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_company_roles_admin_select" ON public.user_company_roles;
CREATE POLICY "user_company_roles_admin_select"
  ON public.user_company_roles
  FOR SELECT
  TO authenticated
  USING (public.is_company_admin_for_org(org_id));

-- No INSERT/UPDATE/DELETE for authenticated clients — roles are assigned by trigger / service role only.

CREATE OR REPLACE FUNCTION public.touch_user_company_roles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_company_roles_updated_at ON public.user_company_roles;
CREATE TRIGGER user_company_roles_updated_at
  BEFORE UPDATE ON public.user_company_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_company_roles_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_user_company_role(
  p_user_id uuid,
  p_org_id uuid,
  p_company_role text,
  p_onboarding_form text,
  p_assigned_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_by uuid := p_assigned_by;
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;

  -- memberships can outlive auth.users rows; skip rather than violate user_id FK.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RETURN;
  END IF;

  IF v_assigned_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_assigned_by) THEN
    v_assigned_by := NULL;
  END IF;

  INSERT INTO public.user_company_roles (user_id, org_id, company_role, onboarding_form, assigned_by)
  VALUES (
    p_user_id,
    p_org_id,
    lower(trim(coalesce(p_company_role, 'employee'))),
    CASE WHEN lower(trim(coalesce(p_onboarding_form, 'member'))) = 'admin' THEN 'admin' ELSE 'member' END,
    v_assigned_by
  )
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    company_role = EXCLUDED.company_role,
    onboarding_form = EXCLUDED.onboarding_form,
    assigned_by = COALESCE(EXCLUDED.assigned_by, user_company_roles.assigned_by),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_company_role(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_user_company_role(uuid, uuid, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.user_company_roles%ROWTYPE;
  v_owned_org uuid;
  v_fallback_org uuid;
  v_fallback_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT o.id INTO v_owned_org
  FROM public.organizations o
  WHERE o.owner_id = v_user_id
  ORDER BY o.created_at ASC
  LIMIT 1;

  SELECT * INTO v_row
  FROM public.user_company_roles ucr
  WHERE ucr.user_id = v_user_id
  ORDER BY
    CASE WHEN v_owned_org IS NOT NULL AND ucr.org_id = v_owned_org THEN 0 ELSE 1 END,
    ucr.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT m.org_id, m.role INTO v_fallback_org, v_fallback_role
    FROM public.memberships m
    WHERE m.user_id = v_user_id
    ORDER BY m.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'user_id', v_user_id,
        'org_id', null,
        'company_role', null,
        'onboarding_form', 'admin',
        'is_org_owner', false,
        'assigned_by', null
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'user_id', v_user_id,
      'org_id', v_fallback_org,
      'company_role', v_fallback_role,
      'onboarding_form', CASE WHEN v_fallback_role = 'owner' OR v_owned_org = v_fallback_org THEN 'admin' ELSE 'member' END,
      'is_org_owner', v_owned_org IS NOT NULL AND v_owned_org = v_fallback_org,
      'assigned_by', null
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'org_id', v_row.org_id,
    'company_role', v_row.company_role,
    'onboarding_form', v_row.onboarding_form,
    'is_org_owner', v_owned_org IS NOT NULL AND v_owned_org = v_row.org_id,
    'assigned_by', v_row.assigned_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_context() TO authenticated;

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
BEGIN
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

  IF v_company_org_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.memberships (org_id, user_id, role, job_function)
      VALUES (v_company_org_id, NEW.id, v_company_role, v_job_function)
      ON CONFLICT (org_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        job_function = EXCLUDED.job_function;

      v_onboarding_form := 'member';
      PERFORM public.upsert_user_company_role(
        NEW.id,
        v_company_org_id,
        v_company_role,
        v_onboarding_form,
        v_invited_by
      );
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
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Backfill roles for existing users from memberships / org ownership.
-- Skip orphaned memberships whose user_id no longer exists in auth.users.
INSERT INTO public.user_company_roles (user_id, org_id, company_role, onboarding_form, assigned_by)
SELECT
  m.user_id,
  m.org_id,
  m.role,
  CASE
    WHEN o.owner_id = m.user_id OR m.role = 'owner' THEN 'admin'
    ELSE 'member'
  END,
  NULL
FROM public.memberships m
INNER JOIN auth.users u ON u.id = m.user_id
LEFT JOIN public.organizations o ON o.id = m.org_id
ON CONFLICT (user_id, org_id) DO NOTHING;
