-- Till invite codes: hashed short codes on company_invites, required till for POS source,
-- memberships.pos_register_id so cashiers cannot pick another till.
-- Do not add a stores table. till_id = pos_registers.id. business = org_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS invite_code_hash text,
  ADD COLUMN IF NOT EXISTS invited_name text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMENT ON COLUMN public.company_invites.invite_code_hash IS
  'SHA-256 hex of the normalized till invite code (no hyphens). Raw code is never stored.';
COMMENT ON COLUMN public.company_invites.invited_name IS
  'Optional display name collected when the POS invite is created.';
COMMENT ON COLUMN public.company_invites.revoked_at IS
  'Set when status becomes revoked. Unused codes stop working immediately.';

CREATE UNIQUE INDEX IF NOT EXISTS company_invites_invite_code_hash_uidx
  ON public.company_invites (invite_code_hash)
  WHERE invite_code_hash IS NOT NULL;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS pos_register_id uuid;

COMMENT ON COLUMN public.memberships.pos_register_id IS
  'Till this member is assigned to (POS-only staff). Not a store. Owners/managers leave this null.';

DO $$
BEGIN
  IF to_regclass('public.pos_registers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'memberships_pos_register_id_fkey'
     ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_pos_register_id_fkey
      FOREIGN KEY (pos_register_id) REFERENCES public.pos_registers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS memberships_pos_register_id_idx
  ON public.memberships (pos_register_id)
  WHERE pos_register_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_pos_till_invite_code(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.hash_pos_till_invite_code(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.normalize_pos_till_invite_code(raw) = '' THEN NULL
    ELSE encode(digest(convert_to(public.normalize_pos_till_invite_code(raw), 'UTF8'), 'sha256'), 'hex')
  END;
$$;

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
  v_register_name text;
  v_hash text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_token');
  END IF;

  v_hash := public.hash_pos_till_invite_code(p_token);

  SELECT * INTO v_row
  FROM public.company_invites
  WHERE token = trim(p_token)
     OR (v_hash IS NOT NULL AND invite_code_hash = v_hash)
  ORDER BY CASE WHEN token = trim(p_token) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status = 'revoked' OR v_row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked', 'status', 'revoked');
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

  IF v_row.register_id IS NOT NULL AND to_regclass('public.pos_registers') IS NOT NULL THEN
    SELECT r.name INTO v_register_name
    FROM public.pos_registers r
    WHERE r.id = v_row.register_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_row.id,
    'email', v_row.email,
    'invited_name', v_row.invited_name,
    'role', v_row.role,
    'job_function', public.normalize_job_function(coalesce(v_row.job_function, 'general')),
    'source', coalesce(v_row.source, 'company_admin'),
    'org_id', v_row.org_id,
    'company_name', coalesce(v_org_name, 'your company'),
    'expires_at', v_row.expires_at,
    'transfer_org_ownership', coalesce(v_row.transfer_org_ownership, false),
    'register_id', v_row.register_id,
    'register_name', v_register_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_invite_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_company_invite_token(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_company_invite_token(text) TO authenticated;

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
  v_register_id uuid;
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
  BEGIN
    v_register_id := NULLIF(v_meta->>'register_id', '')::uuid;
  EXCEPTION
    WHEN others THEN
      v_register_id := NULL;
  END;

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
        job_function = v_job_function,
        pos_register_id = CASE
          WHEN v_job_function = 'pos' THEN COALESCE(v_register_id, pos_register_id)
          ELSE pos_register_id
        END
    WHERE org_id = v_org_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.memberships (org_id, user_id, role, job_function, pos_register_id)
    VALUES (
      v_org_id,
      v_user_id,
      v_membership_role,
      v_job_function,
      CASE WHEN v_job_function = 'pos' THEN v_register_id ELSE NULL END
    );
  END IF;

  IF coalesce((v_meta->>'transfer_org_ownership')::boolean, false) THEN
    UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;
    UPDATE public.memberships
    SET role = 'owner', job_function = 'general', pos_register_id = NULL
    WHERE org_id = v_org_id AND user_id = v_user_id;
    v_onboarding_form := 'admin';
    v_membership_role := 'owner';
    v_job_function := 'general';
  END IF;

  PERFORM public.upsert_user_company_role(
    v_user_id, v_org_id, public.normalize_company_role(v_membership_role), v_onboarding_form, NULL
  );
  PERFORM public.sync_saas_user_roles(v_user_id);

  IF v_job_function = 'pos' AND v_register_id IS NOT NULL AND to_regclass('public.pos_registers') IS NOT NULL THEN
    UPDATE public.pos_registers
    SET assigned_staff_id = v_user_id
    WHERE id = v_register_id
      AND org_id = v_org_id;
  END IF;

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_org_id,
    'role', v_membership_role,
    'job_function', v_job_function,
    'register_id', v_register_id,
    'scope', CASE WHEN v_job_function = 'pos' THEN 'pos' ELSE 'paidly' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_company_invite_token(text) TO authenticated;
