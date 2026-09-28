-- Employee portal: human-readable company URL (/employee/<portal_slug>) + revocation enforced in RLS.
--
-- Security model (the slug is NOT authentication):
--   portal_slug             → identifies which workforce portal (public, like a company login page)
--   auth.uid()              → identifies the person
--   memberships row         → establishes employment in THAT org (active: not disabled, not portal-revoked)
--   role / job_function     → what they may do
--   RLS + server gates      → enforce it
--
-- 1. organizations.portal_slug: lowercase, URL-safe, unique, not a reserved route word, generated once from
--    the business name on insert and NOT changed when the name changes (stable URL).
-- 2. get_workforce_portal(slug)          anon+auth: branding only (name, logo) — no ids.
--    resolve_my_workforce_portal(slug)   auth: the caller's own ACTIVE employment in that org, or a reason.
--    my_workforce_portals()              auth: the caller's employments (portal picker / post-activation redirect).
-- 3. A disabled or portal-revoked membership grants nothing: is_org_member / user_company_role_for_org only
--    count active memberships, and a RESTRICTIVE policy on every org-scoped table denies a revoked/disabled
--    member of that org (existing sessions included) regardless of other permissive policies.
-- 4. org_has_pos_permission honours memberships.pos_access_disabled_at for non-managers.

-- ---------------------------------------------------------------------------------------------------
-- Slug rules (mirrored in shared/workforce/portalSlug.js). A slug never looks like a UUID.
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_reserved_portal_slug(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_slug, '')) = ANY (ARRAY[
    'admin', 'administrator', 'login', 'logout', 'signin', 'sign-in', 'signup', 'sign-up', 'register',
    'api', 'settings', 'invite', 'invites', 'join', 'activate', 'activation', 'verify', 'reset',
    'password', 'forgot-password', 'auth', 'oauth', 'callback', 'account', 'accounts', 'me', 'profile',
    'pos', 'till', 'dashboard', 'app', 'portal', 'employee', 'employees', 'staff', 'team', 'workforce',
    'payroll', 'payslip', 'payslips', 'leave', 'billing', 'subscription', 'support', 'help', 'paidly',
    'www', 'static', 'assets', 'public', 'new', 'edit', 'delete', 'null', 'undefined', 'root', 'system',
    'test', 'demo', 'status', 'security'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.is_valid_portal_slug(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_slug IS NOT NULL
    AND length(p_slug) BETWEEN 3 AND 48
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND p_slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT public.is_reserved_portal_slug(p_slug);
$$;

-- Lowercase, fold common Latin accents, anything else non [a-z0-9] → single hyphens, max 40 chars.
CREATE OR REPLACE FUNCTION public.slugify_portal_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    left(
      btrim(
        regexp_replace(
          regexp_replace(
            translate(
              lower(coalesce(p_name, '')),
              'àáâãäåāçćčèéêëēėęìíîïīłñńòóôõöøōśšùúûüūýÿžźż',
              'aaaaaaaccceeeeeeeiiiiilnnoooooooossuuuuuyyzzz'
            ),
            '[^a-z0-9]+', '-', 'g'
          ),
          '-+', '-', 'g'
        ),
        '-'
      ),
      40
    ),
    '-'
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_portal_slug(p_name text, p_exclude_org uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text := public.slugify_portal_name(p_name);
  v_candidate text;
  v_n int := 1;
BEGIN
  IF v_base IS NULL OR length(v_base) < 3 THEN
    v_base := 'team' || CASE WHEN coalesce(v_base, '') = '' THEN '' ELSE '-' || v_base END;
  END IF;
  v_base := btrim(left(v_base, 44), '-');
  v_candidate := v_base;
  LOOP
    IF public.is_valid_portal_slug(v_candidate)
       AND NOT EXISTS (
         SELECT 1 FROM public.organizations o
         WHERE o.portal_slug = v_candidate
           AND o.id IS DISTINCT FROM p_exclude_org
       ) THEN
      RETURN v_candidate;
    END IF;
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n::text;
    IF v_n > 500 THEN
      RETURN v_base || '-' || substr(md5(random()::text), 1, 6);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_unique_portal_slug(text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- organizations.portal_slug
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS portal_slug text;

COMMENT ON COLUMN public.organizations.portal_slug IS
  'Stable public id of the employee portal (/employee/<slug>). Identifies the portal only — never grants access. '
  'Generated once from the name; renaming the business does not change it.';

CREATE OR REPLACE FUNCTION public.organizations_portal_slug_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.portal_slug IS NULL OR btrim(NEW.portal_slug) = '' THEN
      NEW.portal_slug := public.generate_unique_portal_slug(NEW.name, NEW.id);
      RETURN NEW;
    END IF;
  ELSIF NEW.portal_slug IS NOT DISTINCT FROM OLD.portal_slug THEN
    RETURN NEW;
  ELSIF NEW.portal_slug IS NULL OR btrim(NEW.portal_slug) = '' THEN
    -- A portal URL is never cleared (it would silently break every employee's bookmark).
    NEW.portal_slug := coalesce(OLD.portal_slug, public.generate_unique_portal_slug(NEW.name, NEW.id));
    RETURN NEW;
  END IF;

  NEW.portal_slug := lower(btrim(NEW.portal_slug));
  IF NOT public.is_valid_portal_slug(NEW.portal_slug) THEN
    RAISE EXCEPTION 'Portal address must be 3–48 lowercase letters, numbers or single hyphens, and not a reserved word.'
      USING ERRCODE = '22023', HINT = 'PORTAL_SLUG_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.portal_slug = NEW.portal_slug AND o.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'That portal address is already taken.' USING ERRCODE = '23505', HINT = 'PORTAL_SLUG_TAKEN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_portal_slug ON public.organizations;
CREATE TRIGGER trg_organizations_portal_slug
  BEFORE INSERT OR UPDATE OF portal_slug ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.organizations_portal_slug_guard();

-- Backfill oldest first so the earliest business keeps the plain name.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, name FROM public.organizations WHERE portal_slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.organizations
    SET portal_slug = public.generate_unique_portal_slug(r.name, r.id)
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.organizations ALTER COLUMN portal_slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_portal_slug_valid') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_portal_slug_valid CHECK (public.is_valid_portal_slug(portal_slug));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_portal_slug_key ON public.organizations (portal_slug);

-- ---------------------------------------------------------------------------------------------------
-- Active membership = not disabled and portal not revoked. Inactive memberships grant nothing.
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
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
      AND m.disabled_at IS NULL
      AND m.portal_revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = target_org_id AND o.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_company_role_for_org(target_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_company_role(m.role)
  FROM public.memberships m
  WHERE m.org_id = target_org_id
    AND m.user_id = auth.uid()
    AND m.disabled_at IS NULL
    AND m.portal_revoked_at IS NULL
  LIMIT 1;
$$;

-- True when the caller's membership in this org is disabled or portal-revoked (and they do not own it).
CREATE OR REPLACE FUNCTION public.is_blocked_member_for_org(target_org_id uuid)
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
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
      AND (m.disabled_at IS NOT NULL OR m.portal_revoked_at IS NOT NULL)
      AND o.owner_id IS DISTINCT FROM auth.uid()
  );
$$;

-- Helpers that checked "a membership row exists" now require an active one.
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
  SELECT public.is_org_member(target_org_id)
  AND NOT public.is_pos_only_staff_for_org(target_org_id)
  AND (
    public.is_admin()
    OR public.can_view_org_financials(target_org_id)
    OR row_user_id = auth.uid()
    OR row_created_by = auth.uid()
    OR row_created_by_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_payslip_row(p public.payslips)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_member(p.org_id)
  AND (
    public.is_admin()
    OR public.is_company_admin_for_org(p.org_id)
    OR public.can_manage_org_payroll(p.org_id)
    OR p.employee_user_id = auth.uid()
    OR p.user_id = auth.uid()
    OR p.created_by_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships own
      WHERE own.id = p.membership_id
        AND own.org_id = p.org_id
        AND own.user_id = auth.uid()
        AND NOT public.is_pos_only_staff_for_org(p.org_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_document_row(d public.documents)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_member(d.org_id)
  AND (
    public.is_admin()
    OR public.is_company_admin_for_org(d.org_id)
    OR public.is_company_manager_for_org(d.org_id)
    OR d.created_by = auth.uid()
    OR d.user_id = auth.uid()
    OR d.assigned_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.org_has_pos_permission(target_org_id uuid, permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_org_id IS NULL OR permission IS NULL OR btrim(permission) = '' THEN
    RETURN false;
  END IF;
  IF public.is_company_admin_for_org(target_org_id) OR public.is_company_manager_for_org(target_org_id) THEN
    RETURN permission IN (
      'pos_access', 'pos_sell', 'pos_discount', 'pos_refund', 'pos_close_register', 'pos_view_reports'
    );
  END IF;
  IF public.is_org_member(target_org_id) AND NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
      AND m.pos_access_disabled_at IS NOT NULL
  ) THEN
    RETURN permission IN ('pos_access', 'pos_sell');
  END IF;
  RETURN false;
END;
$$;

-- RESTRICTIVE: AND-ed with every permissive policy, so no legacy/any-member policy can let a revoked or
-- disabled member read or write that org's rows. memberships is excluded so the person can still see their
-- own (revoked) membership status; the portal resolver reports it too.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND a.atttypid = 'uuid'::regtype
      AND c.relname <> 'memberships'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'inactive members have no org access', t.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT public.is_blocked_member_for_org(org_id)) '
      'WITH CHECK (NOT public.is_blocked_member_for_org(org_id))',
      'inactive members have no org access', t.tablename
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "inactive members have no org access" ON public.organizations;
CREATE POLICY "inactive members have no org access" ON public.organizations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_blocked_member_for_org(id))
  WITH CHECK (NOT public.is_blocked_member_for_org(id));

-- Own-row branches that did not check membership at all.
DROP POLICY IF EXISTS pay_run_items_select ON public.pay_run_items;
CREATE POLICY pay_run_items_select ON public.pay_run_items
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR (user_id = auth.uid() AND public.is_org_member(org_id) AND NOT public.is_pos_only_staff_for_org(org_id))
  );

DROP POLICY IF EXISTS payroll_profiles_select ON public.payroll_profiles;
CREATE POLICY payroll_profiles_select ON public.payroll_profiles
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      NOT public.is_pos_only_staff_for_org(org_id)
      AND ((user_id = auth.uid() AND public.is_org_member(org_id)) OR public.is_company_admin_for_org(org_id))
    )
  );

DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;
CREATE POLICY leave_requests_select ON public.leave_requests
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR (user_id = auth.uid() AND public.is_org_member(org_id) AND NOT public.is_pos_only_staff_for_org(org_id))
  );

-- ---------------------------------------------------------------------------------------------------
-- Portal RPCs
-- ---------------------------------------------------------------------------------------------------

-- Public branding for the portal sign-in page. No ids, no membership information.
CREATE OR REPLACE FUNCTION public.get_workforce_portal(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text;
  v_logo text;
BEGIN
  IF NOT public.is_valid_portal_slug(v_slug) THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT o.name, o.logo_url INTO v_name, v_logo
  FROM public.organizations o
  WHERE o.portal_slug = v_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'slug', v_slug, 'company_name', v_name, 'logo_url', v_logo);
END;
$$;

-- The caller's own employment in the portal's org. Never trusts anything but auth.uid() + the slug.
CREATE OR REPLACE FUNCTION public.resolve_my_workforce_portal(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_org public.organizations%ROWTYPE;
  v_m public.memberships%ROWTYPE;
  v_owner boolean;
  v_role text;
  v_fn text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF NOT public.is_valid_portal_slug(v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE portal_slug = v_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_owner := v_org.owner_id = v_uid;
  SELECT * INTO v_m FROM public.memberships WHERE org_id = v_org.id AND user_id = v_uid;
  IF NOT FOUND AND NOT v_owner THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_employment');
  END IF;
  IF NOT v_owner AND v_m.disabled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deactivated');
  END IF;
  IF NOT v_owner AND v_m.portal_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;

  v_role := CASE WHEN v_owner THEN 'owner' ELSE lower(btrim(coalesce(v_m.role, 'employee'))) END;
  v_fn := public.normalize_job_function(coalesce(v_m.job_function, 'general'));
  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'org_id', v_org.id,
    'company_name', v_org.name,
    'logo_url', v_org.logo_url,
    'membership_id', v_m.id,
    'role', v_role,
    'company_role', public.normalize_company_role(v_role),
    'job_function', v_fn,
    'is_owner', v_owner,
    'pos_enabled',
      v_owner
      OR (
        v_m.pos_access_disabled_at IS NULL
        AND (
          public.normalize_company_role(v_role) IN ('admin', 'manager')
          OR v_fn = 'pos'
          OR v_m.pos_register_id IS NOT NULL
        )
      )
  );
END;
$$;

-- Workforce portals the caller is EMPLOYED at (not businesses they own), active memberships only.
CREATE OR REPLACE FUNCTION public.my_workforce_portals()
RETURNS TABLE (org_id uuid, slug text, company_name text, logo_url text, role text, job_function text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.portal_slug, o.name, o.logo_url, lower(btrim(m.role)), public.normalize_job_function(m.job_function)
  FROM public.memberships m
  JOIN public.organizations o ON o.id = m.org_id
  WHERE m.user_id = auth.uid()
    AND o.owner_id IS DISTINCT FROM auth.uid()
    AND m.disabled_at IS NULL
    AND m.portal_revoked_at IS NULL
  ORDER BY m.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_workforce_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workforce_portal(text) TO anon, authenticated, service_role;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.resolve_my_workforce_portal(text)',
    'public.my_workforce_portals()',
    'public.is_blocked_member_for_org(uuid)',
    'public.is_org_member(uuid)',
    'public.user_company_role_for_org(uuid)',
    'public.can_read_org_financial_row(uuid, uuid, uuid, uuid)',
    'public.can_read_payslip_row(public.payslips)',
    'public.can_read_document_row(public.documents)',
    'public.org_has_pos_permission(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
