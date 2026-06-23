-- Phase 1: user_roles SaaS layer (synced from memberships + platform profiles.role)
-- Phase 4: employee profile columns + org onboarding fields
-- Invite accept RPC (complements 20260619120000_multi_tenant_company_extension company_invites)

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payroll_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS job_title text;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  company_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_role_check CHECK (role IN ('platform_admin', 'company_admin', 'employee')),
  CONSTRAINT user_roles_scope_check CHECK (
    (role = 'platform_admin' AND company_id IS NULL)
    OR (role IN ('company_admin', 'employee') AND company_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_platform_admin_unique
  ON public.user_roles (user_id) WHERE role = 'platform_admin';

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_tenant_unique
  ON public.user_roles (user_id, company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND lower(trim(coalesce(p.role, ''))) = 'admin'
  )
  OR public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_roles_platform_admin_select" ON public.user_roles;
CREATE POLICY "user_roles_platform_admin_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "user_roles_company_admin_select" ON public.user_roles;
CREATE POLICY "user_roles_company_admin_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_admin_for_org(company_id));

CREATE OR REPLACE FUNCTION public.membership_to_saas_role(membership_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(membership_role, '')))
    WHEN 'owner' THEN 'company_admin'
    WHEN 'admin' THEN 'company_admin'
    WHEN 'manager' THEN 'company_admin'
    ELSE 'employee'
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_saas_user_roles(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN RETURN; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND lower(trim(coalesce(p.role, ''))) = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (p_user_id, 'platform_admin', NULL);
    RETURN;
  END IF;

  FOR m IN SELECT org_id, role FROM public.memberships WHERE user_id = p_user_id
  LOOP
    INSERT INTO public.user_roles (user_id, role, company_id)
    VALUES (p_user_id, public.membership_to_saas_role(m.role), m.org_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_saas_user_roles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_saas_user_roles(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_saas_user_roles_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_saas_user_roles(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS memberships_sync_saas_user_roles ON public.memberships;
CREATE TRIGGER memberships_sync_saas_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.sync_saas_user_roles_trigger();

CREATE OR REPLACE FUNCTION public.profiles_sync_saas_user_roles_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_saas_user_roles(OLD.id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_saas_user_roles(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_saas_user_roles ON public.profiles;
CREATE TRIGGER profiles_sync_saas_user_roles
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_saas_user_roles_trigger();

DO $$
DECLARE uid uuid;
BEGIN
  FOR uid IN
    SELECT DISTINCT m.user_id
    FROM public.memberships m
    INNER JOIN auth.users u ON u.id = m.user_id
    UNION
    SELECT p.id
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    WHERE lower(trim(coalesce(p.role, ''))) = 'admin'
  LOOP
    PERFORM public.sync_saas_user_roles(uid);
  END LOOP;
END;
$$;

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

  PERFORM public.upsert_user_company_role(
    v_user_id, v_org_id, public.normalize_company_role(v_membership_role), 'member', NULL
  );
  PERFORM public.sync_saas_user_roles(v_user_id);

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'org_id', v_org_id, 'role', v_membership_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_company_invite_token(text) TO authenticated;

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
    v_saas_role := CASE WHEN v_owned_org IS NOT NULL THEN 'company_admin' ELSE 'company_admin' END;
    v_org_id := v_owned_org;
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
