-- Allow internal team roles to view/manage affiliate pipeline.
-- Why: admin-v2 Affiliates page is used by management/support, but legacy RLS only allowed public.is_admin().
-- NOTE: profiles schema differs by environment (`role` vs `user_role` vs neither), so we read via to_jsonb().

CREATE OR REPLACE FUNCTION public.profile_role_value(p public.profiles)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(
    coalesce(
      to_jsonb(p)->>'role',
      to_jsonb(p)->>'user_role',
      ''
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_internal_team()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.profile_role_value(p) IN ('admin', 'management', 'support')
  );
$$;

DO $$
BEGIN
  -- affiliate_applications
  DROP POLICY IF EXISTS "affiliate_applications_admin_select" ON public.affiliate_applications;
  DROP POLICY IF EXISTS "affiliate_applications_admin_update" ON public.affiliate_applications;
  DROP POLICY IF EXISTS "affiliate_applications_admin_delete" ON public.affiliate_applications;

  CREATE POLICY "affiliate_applications_team_select"
    ON public.affiliate_applications FOR SELECT TO authenticated
    USING (public.is_internal_team());

  -- approve/decline should remain admin + management only
  CREATE POLICY "affiliate_applications_management_update"
    ON public.affiliate_applications FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    );

  CREATE POLICY "affiliate_applications_management_delete"
    ON public.affiliate_applications FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    );

  -- affiliates table (needed by join/enrichment in base44Client list)
  DROP POLICY IF EXISTS "affiliates_admin_select" ON public.affiliates;
  DROP POLICY IF EXISTS "affiliates_admin_insert" ON public.affiliates;
  DROP POLICY IF EXISTS "affiliates_admin_update" ON public.affiliates;
  DROP POLICY IF EXISTS "affiliates_admin_delete" ON public.affiliates;

  CREATE POLICY "affiliates_team_select"
    ON public.affiliates FOR SELECT TO authenticated
    USING (public.is_internal_team());

  -- backend approval flow writes with service role; keep management write open in case of direct admin edits.
  CREATE POLICY "affiliates_management_insert"
    ON public.affiliates FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    );

  CREATE POLICY "affiliates_management_update"
    ON public.affiliates FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    );

  CREATE POLICY "affiliates_management_delete"
    ON public.affiliates FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.profile_role_value(p) IN ('admin', 'management')
      )
    );
END $$;
