-- Fix: "new row violates row-level security policy for table organizations" when creating the first org/membership.
--
-- Causes:
-- - Missing GRANT on organizations/memberships for role `authenticated`.
-- - Policies exist only as FOR ALL without TO authenticated (rare drift), or "org owner manage org" missing on a DB.
--
-- 1) Explicit GRANT + INSERT/SELECT/UPDATE/DELETE policies TO authenticated for rows you own.
-- 2) Extra INSERT policy on memberships for (user_id = auth.uid() AND org owned by same user).
-- 3) bootstrap_user_organization(text) SECURITY DEFINER — idempotent org + owner membership using auth.uid() only.

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.memberships TO authenticated;

DROP POLICY IF EXISTS "organizations_authenticated_insert_own" ON public.organizations;
CREATE POLICY "organizations_authenticated_insert_own"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizations_authenticated_select_own" ON public.organizations;
CREATE POLICY "organizations_authenticated_select_own"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizations_authenticated_update_own" ON public.organizations;
CREATE POLICY "organizations_authenticated_update_own"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizations_authenticated_delete_own" ON public.organizations;
CREATE POLICY "organizations_authenticated_delete_own"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "memberships_authenticated_insert_own_org" ON public.memberships;
CREATE POLICY "memberships_authenticated_insert_own_org"
  ON public.memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = memberships.org_id
        AND o.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.bootstrap_user_organization(p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.org_id INTO v_org_id
  FROM public.memberships m
  WHERE m.user_id = v_uid
  ORDER BY m.created_at ASC
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  SELECT o.id INTO v_org_id
  FROM public.organizations o
  WHERE o.owner_id = v_uid
  ORDER BY o.created_at ASC
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.memberships (org_id, user_id, role)
    VALUES (v_org_id, v_uid, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;
    RETURN v_org_id;
  END IF;

  v_name := COALESCE(NULLIF(trim(p_name), ''), 'My Organization');

  INSERT INTO public.organizations (name, owner_id)
  VALUES (v_name, v_uid)
  RETURNING id INTO v_org_id;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN v_org_id;
END;
$func$;

COMMENT ON FUNCTION public.bootstrap_user_organization(text) IS
  'Idempotent: returns existing membership org or creates organizations + memberships row for auth.uid(); bypasses RLS.';

REVOKE ALL ON FUNCTION public.bootstrap_user_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_user_organization(text) TO authenticated;
