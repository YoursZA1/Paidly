-- POS-only staff invites: same Auth + memberships, job_function = pos.
-- Shareable till link is /invite?token=…&next=POS. Do not add a second POS login.

CREATE OR REPLACE FUNCTION public.normalize_job_function(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(replace(coalesce(raw, ''), ' ', '_')))
    WHEN 'human_resources' THEN 'hr'
    WHEN 'sales' THEN 'sales'
    WHEN 'hr' THEN 'hr'
    WHEN 'finance' THEN 'finance'
    WHEN 'operations' THEN 'operations'
    WHEN 'support' THEN 'support'
    WHEN 'marketing' THEN 'marketing'
    WHEN 'it' THEN 'it'
    WHEN 'pos' THEN 'pos'
    WHEN 'cashier' THEN 'pos'
    WHEN 'till' THEN 'pos'
    WHEN 'general' THEN 'general'
    ELSE 'general'
  END;
$$;

DO $$
BEGIN
  IF to_regclass('public.company_invites') IS NULL THEN
    RAISE EXCEPTION 'company_invites missing — apply invite lifecycle migrations before POS staff invites';
  END IF;
END $$;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS job_function text NOT NULL DEFAULT 'general';

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'company_admin';

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS transfer_org_ownership boolean NOT NULL DEFAULT false;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS job_function text NOT NULL DEFAULT 'general';

COMMENT ON COLUMN public.company_invites.job_function IS
  'Copied onto memberships.job_function on accept. pos = till-only staff (RBAC role stays employee).';

COMMENT ON COLUMN public.company_invites.source IS
  'Who issued the invite: company_admin | platform_admin | pos';

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
    'job_function', public.normalize_job_function(coalesce(v_row.job_function, 'general')),
    'source', coalesce(v_row.source, 'company_admin'),
    'org_id', v_row.org_id,
    'company_name', coalesce(v_org_name, 'your company'),
    'expires_at', v_row.expires_at,
    'transfer_org_ownership', coalesce(v_row.transfer_org_ownership, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_company_invite_token(text) TO anon, authenticated;

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
  v_job_function text;
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
  v_job_function := public.normalize_job_function(
    COALESCE(v_meta->>'job_function', 'general')
  );
  IF lower(trim(coalesce(v_meta->>'source', ''))) = 'pos' THEN
    v_job_function := 'pos';
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL OR v_email <> lower(trim(v_meta->>'email')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_membership_role := CASE
    WHEN v_role IN ('admin', 'owner', 'company_admin') THEN 'admin'
    WHEN v_role = 'manager' THEN 'manager'
    ELSE 'employee'
  END;

  IF v_job_function = 'pos' THEN
    v_membership_role := 'employee';
  END IF;

  v_onboarding_form := CASE
    WHEN v_membership_role IN ('admin', 'owner') THEN 'admin'
    ELSE 'member'
  END;

  IF EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = v_org_id AND m.user_id = v_user_id
  ) THEN
    UPDATE public.memberships
    SET role = v_membership_role,
        job_function = v_job_function
    WHERE org_id = v_org_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.memberships (org_id, user_id, role, job_function)
    VALUES (v_org_id, v_user_id, v_membership_role, v_job_function);
  END IF;

  IF coalesce((v_meta->>'transfer_org_ownership')::boolean, false) THEN
    UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;
    UPDATE public.memberships SET role = 'owner', job_function = 'general' WHERE org_id = v_org_id AND user_id = v_user_id;
    v_onboarding_form := 'admin';
    v_membership_role := 'owner';
    v_job_function := 'general';
  END IF;

  PERFORM public.upsert_user_company_role(
    v_user_id, v_org_id, public.normalize_company_role(v_membership_role), v_onboarding_form, NULL
  );
  PERFORM public.sync_saas_user_roles(v_user_id);

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_org_id,
    'role', v_membership_role,
    'job_function', v_job_function
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_company_invite_token(text) TO authenticated;
