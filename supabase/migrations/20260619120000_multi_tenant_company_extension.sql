-- Multi-tenant company extension: org profile fields, persistent invites, role-scoped financial RLS.
-- Maps product "companies" → organizations, "user_roles" → memberships + user_company_roles.
-- Does NOT alter auth triggers beyond what prior migrations already established.

-- ── Phase 2: Company profile on organizations ─────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS payroll_settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_info jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON TABLE public.organizations IS
  'Tenant company record. Product copy uses company_id; database key is org id. owner_id = created_by.';

-- Members and company admins can read their org; owners retain full CRUD via existing policies.
DROP POLICY IF EXISTS "organizations_member_select" ON public.organizations;
CREATE POLICY "organizations_member_select"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.is_company_admin_for_org(id)
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = organizations.id AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "organizations_admin_update_profile" ON public.organizations;
CREATE POLICY "organizations_admin_update_profile"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_company_admin_for_org(id))
  WITH CHECK (public.is_company_admin_for_org(id));

-- ── Phase 3: Persistent company invites ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT company_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  CONSTRAINT company_invites_role_check
    CHECK (role IN ('employee', 'manager', 'admin', 'owner'))
);

CREATE INDEX IF NOT EXISTS company_invites_org_id_idx ON public.company_invites (org_id);
CREATE INDEX IF NOT EXISTS company_invites_email_idx ON public.company_invites (lower(email));
CREATE INDEX IF NOT EXISTS company_invites_status_expires_idx
  ON public.company_invites (status, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_admin_select" ON public.company_invites;
CREATE POLICY "company_invites_admin_select"
  ON public.company_invites
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );

-- Inserts/updates only via service_role API (companyTeamRoutes).

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
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_company_invite_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_company_invite_accepted(p_token text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_invites
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by = p_user_id
  WHERE token = trim(p_token)
    AND status = 'pending'
    AND expires_at >= now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_company_invite_accepted(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_company_invite_accepted(text, uuid) TO service_role;

-- ── Phase 6/7: Role-scoped financial RLS ────────────────────────────────────

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
  AND (
    public.is_admin()
    OR public.is_company_manager_for_org(target_org_id)
    OR row_user_id = auth.uid()
    OR row_created_by = auth.uid()
    OR row_created_by_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.can_read_org_financial_row(uuid, uuid, uuid, uuid) IS
  'Platform admin + company managers see all org rows; employees see only rows they own/created.';

-- Invoices
DROP POLICY IF EXISTS "org members select invoices" ON public.invoices;
CREATE POLICY "org members select invoices" ON public.invoices
  FOR SELECT
  USING (public.can_read_org_financial_row(org_id, user_id, created_by, NULL));

DROP POLICY IF EXISTS "org members write invoices" ON public.invoices;
CREATE POLICY "org members write invoices" ON public.invoices
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, user_id, created_by, NULL)
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR user_id = auth.uid()
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = invoices.org_id AND m.user_id = auth.uid()
    )
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR user_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- Quotes
DROP POLICY IF EXISTS "org members select quotes" ON public.quotes;
CREATE POLICY "org members select quotes" ON public.quotes
  FOR SELECT
  USING (public.can_read_org_financial_row(org_id, user_id, created_by, NULL));

DROP POLICY IF EXISTS "org members write quotes" ON public.quotes;
CREATE POLICY "org members write quotes" ON public.quotes
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, user_id, created_by, NULL)
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR user_id = auth.uid()
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = quotes.org_id AND m.user_id = auth.uid()
    )
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR user_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- Clients
DROP POLICY IF EXISTS "org members select clients" ON public.clients;
CREATE POLICY "org members select clients" ON public.clients
  FOR SELECT
  USING (public.can_read_org_financial_row(org_id, NULL, NULL, created_by_id));

DROP POLICY IF EXISTS "org members write clients" ON public.clients;
CREATE POLICY "org members write clients" ON public.clients
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, NULL, NULL, created_by_id)
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR created_by_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
    )
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
      OR created_by_id = auth.uid()
    )
  );

-- Recurring invoices (admin/manager only)
DROP POLICY IF EXISTS "org members select recurring_invoices" ON public.recurring_invoices;
CREATE POLICY "org members select recurring_invoices" ON public.recurring_invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = recurring_invoices.org_id AND m.user_id = auth.uid()
    )
    AND (
      public.is_admin()
      OR public.is_company_manager_for_org(org_id)
    )
  );

DROP POLICY IF EXISTS "org members write recurring_invoices" ON public.recurring_invoices;
CREATE POLICY "org members write recurring_invoices" ON public.recurring_invoices
  FOR ALL
  USING (
    public.is_admin()
    OR public.is_company_manager_for_org(org_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_company_manager_for_org(org_id)
  );

GRANT EXECUTE ON FUNCTION public.can_read_org_financial_row(uuid, uuid, uuid, uuid) TO authenticated;
