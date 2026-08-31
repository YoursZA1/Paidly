-- POS-only staff scope: not a second login. Same Auth + memberships.job_function = pos.
-- Cashiers cannot read back-office financial rows via RLS. Checkout clients stay readable.
-- Invite URL is /pos/invite/:token. Optional register_id is the till (not a store).

CREATE OR REPLACE FUNCTION public.is_pos_only_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.user_id = auth.uid()
      AND lower(trim(m.role)) = 'employee'
      AND public.normalize_job_function(m.job_function) = 'pos'
      AND o.owner_id IS DISTINCT FROM auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_pos_only_staff() IS
  'True when the signed-in user is an invited till cashier (employee + job_function pos), not the org owner.';

GRANT EXECUTE ON FUNCTION public.is_pos_only_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_org_financial_row(
  target_org_id uuid,
  row_user_id uuid DEFAULT NULL,
  row_created_by uuid DEFAULT NULL,
  row_created_by_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
  )
  AND NOT public.is_pos_only_staff()
  AND (
    public.is_admin()
    OR public.is_company_manager_for_org(target_org_id)
    OR row_user_id = auth.uid()
    OR row_created_by = auth.uid()
    OR row_created_by_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.can_read_org_financial_row(uuid, uuid, uuid, uuid) IS
  'Platform admin + company managers see all org rows; employees see only rows they own/created. POS-only staff never read invoice/quote/payslip financials.';

DO $$
BEGIN
  IF to_regclass('public.clients') IS NOT NULL THEN
    DROP POLICY IF EXISTS "pos staff select clients for checkout" ON public.clients;
    CREATE POLICY "pos staff select clients for checkout" ON public.clients
      FOR SELECT
      USING (
        public.is_pos_only_staff()
        AND EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS register_id uuid;

COMMENT ON COLUMN public.company_invites.register_id IS
  'Optional pos_registers.id the cashier should use after accept. Not a store/location table.';

DO $$
BEGIN
  IF to_regclass('public.pos_registers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'company_invites_register_id_fkey'
     ) THEN
    ALTER TABLE public.company_invites
      ADD CONSTRAINT company_invites_register_id_fkey
      FOREIGN KEY (register_id) REFERENCES public.pos_registers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
    'transfer_org_ownership', coalesce(v_row.transfer_org_ownership, false),
    'register_id', v_row.register_id
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

  IF v_job_function = 'pos' AND v_register_id IS NOT NULL AND to_regclass('public.pos_registers') IS NOT NULL THEN
    UPDATE public.pos_registers
    SET assigned_staff_id = v_user_id
    WHERE id = v_register_id
      AND org_id = v_org_id;
  END IF;

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_org_id,
    'role', v_membership_role,
    'job_function', v_job_function,
    'scope', CASE WHEN v_job_function = 'pos' THEN 'pos' ELSE 'paidly' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_company_invite_token(text) TO authenticated;
