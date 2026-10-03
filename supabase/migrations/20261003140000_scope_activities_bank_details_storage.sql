-- activities + bank-details storage buckets: company-, role- and uploader-scoped (2026-10-03).
--
-- Both buckets are private, but every member of a company — POS cashiers and plain employees included —
-- could read, overwrite and delete every object in them, through bare "is a member of the org" policies:
--   * "org members access assets" (FOR ALL, supabase/schema.postgres.sql) naming both buckets, and
--   * "org members insert/select/update/delete activities|bank-details"
--     (20260518130000_bank_details_activities_bucket_policies.sql).
-- Permissive policies OR together, so these voided any scoped rule (same trap fixed for tables in
-- 20260928120000 and for receipts in 20260930120000). Reproduced in tests/unit/companyFileBuckets.db.test.js.
--
-- What lives there: bank statements uploaded for import (bank-details); message attachments and expense
-- attachments made before 2026-10-03 (activities — new expense receipts go to the private receipts bucket).
-- Paths are {org_id}/{folder}/{timestamp}-{name}.
--
-- New rules (active members only — is_org_member excludes disabled / portal-revoked; never POS-only staff):
--   bank-details  read / upload / replace / delete: owner, admin or manager of that company
--   activities    upload: any active non-POS member, into their own company's folder
--                 read / replace / delete: the uploader, or owner/admin/manager of that company;
--                 an attachment a saved expense still points to (receipt_url) cannot be deleted
-- Platform admins keep their existing policies. paidly / profile-logos are unchanged.
-- Note: signed links already handed out keep working until they expire (they are token-based, not RLS).

CREATE OR REPLACE FUNCTION public.can_access_company_file(
  p_bucket text,
  p_name text,
  p_owner uuid,
  p_owner_id text,
  p_mode text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_uid uuid := auth.uid();
  v_is_uploader boolean;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR position('..' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  BEGIN
    v_org := split_part(p_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF NOT public.is_org_member(v_org) OR public.is_pos_only_staff_for_org(v_org) THEN
    RETURN false;
  END IF;

  IF p_bucket = 'bank-details' THEN
    RETURN public.can_view_org_financials(v_org);
  END IF;

  IF p_bucket <> 'activities' THEN
    RETURN false;
  END IF;

  IF p_mode = 'insert' THEN
    RETURN true;
  END IF;

  v_is_uploader := p_owner = v_uid OR p_owner_id = v_uid::text;

  IF p_mode = 'delete' AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.org_id = v_org
      AND e.receipt_url IS NOT NULL
      AND position('/activities/' || p_name IN e.receipt_url) > 0
  ) THEN
    RETURN false;
  END IF;

  RETURN public.can_view_org_financials(v_org) OR v_is_uploader;
END;
$$;

COMMENT ON FUNCTION public.can_access_company_file(text, text, uuid, text, text) IS
  'Storage RLS for the activities and bank-details buckets: bank statements for owner/admin/manager; '
  'activities for the uploader or owner/admin/manager. Never POS-only staff or inactive members.';

REVOKE ALL ON FUNCTION public.can_access_company_file(text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_company_file(text, text, uuid, text, text) TO authenticated, service_role;

-- Bare-member policies on these two buckets
DROP POLICY IF EXISTS "org members insert activities" ON storage.objects;
DROP POLICY IF EXISTS "org members select activities" ON storage.objects;
DROP POLICY IF EXISTS "org members update activities" ON storage.objects;
DROP POLICY IF EXISTS "org members delete activities" ON storage.objects;
DROP POLICY IF EXISTS "org members insert bank-details" ON storage.objects;
DROP POLICY IF EXISTS "org members select bank-details" ON storage.objects;
DROP POLICY IF EXISTS "org members update bank-details" ON storage.objects;
DROP POLICY IF EXISTS "org members delete bank-details" ON storage.objects;

-- The catch-all keeps its other buckets, minus these two.
DROP POLICY IF EXISTS "org members access assets" ON storage.objects;
CREATE POLICY "org members access assets" ON storage.objects
  FOR ALL
  USING (
    bucket_id = ANY (ARRAY['paidly', 'profile-logos'])
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND (storage.foldername(objects.name))[1] = m.org_id::text
    )
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['paidly', 'profile-logos'])
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND (storage.foldername(objects.name))[1] = m.org_id::text
    )
  );

DROP POLICY IF EXISTS "company files read" ON storage.objects;
CREATE POLICY "company files read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('activities', 'bank-details')
    AND public.can_access_company_file(bucket_id, name, owner, owner_id, 'read')
  );

DROP POLICY IF EXISTS "company files upload" ON storage.objects;
CREATE POLICY "company files upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('activities', 'bank-details')
    AND public.can_access_company_file(bucket_id, name, owner, owner_id, 'insert')
  );

-- Uploads use upsert, so the uploader may replace their own object (same company folder).
DROP POLICY IF EXISTS "company files replace" ON storage.objects;
CREATE POLICY "company files replace" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('activities', 'bank-details')
    AND public.can_access_company_file(bucket_id, name, owner, owner_id, 'update')
  )
  WITH CHECK (
    bucket_id IN ('activities', 'bank-details')
    AND public.can_access_company_file(bucket_id, name, owner, owner_id, 'update')
  );

DROP POLICY IF EXISTS "company files delete" ON storage.objects;
CREATE POLICY "company files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('activities', 'bank-details')
    AND public.can_access_company_file(bucket_id, name, owner, owner_id, 'delete')
  );
