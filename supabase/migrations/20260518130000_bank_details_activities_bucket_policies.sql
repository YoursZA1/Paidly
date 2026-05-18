-- RLS policies for bank-details and activities storage buckets.
-- Both buckets exist in production with 0 policies — all uploads fail at runtime.
-- Path convention (IntegrationManager.js): {org_id}/{bucket}/{filename}
-- Scope: org members only (matches receipts bucket pattern).

-- ============================================================
-- bank-details bucket
-- ============================================================

DROP POLICY IF EXISTS "org members insert bank-details"  ON storage.objects;
DROP POLICY IF EXISTS "org members select bank-details"  ON storage.objects;
DROP POLICY IF EXISTS "org members update bank-details"  ON storage.objects;
DROP POLICY IF EXISTS "org members delete bank-details"  ON storage.objects;
DROP POLICY IF EXISTS "admin full access bank-details"   ON storage.objects;

CREATE POLICY "org members insert bank-details"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bank-details'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members select bank-details"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bank-details'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members update bank-details"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'bank-details'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members delete bank-details"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'bank-details'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "admin full access bank-details"
ON storage.objects FOR ALL TO authenticated
USING  (bucket_id = 'bank-details' AND public.is_admin())
WITH CHECK (bucket_id = 'bank-details' AND public.is_admin());

-- ============================================================
-- activities bucket
-- ============================================================

DROP POLICY IF EXISTS "org members insert activities"  ON storage.objects;
DROP POLICY IF EXISTS "org members select activities"  ON storage.objects;
DROP POLICY IF EXISTS "org members update activities"  ON storage.objects;
DROP POLICY IF EXISTS "org members delete activities"  ON storage.objects;
DROP POLICY IF EXISTS "admin full access activities"   ON storage.objects;

CREATE POLICY "org members insert activities"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'activities'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members select activities"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'activities'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members update activities"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'activities'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "org members delete activities"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'activities'
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (SELECT auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

CREATE POLICY "admin full access activities"
ON storage.objects FOR ALL TO authenticated
USING  (bucket_id = 'activities' AND public.is_admin())
WITH CHECK (bucket_id = 'activities' AND public.is_admin());
