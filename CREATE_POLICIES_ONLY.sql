-- ============================================
-- CREATE RLS POLICIES FOR LOGO UPLOADS
-- ============================================
-- Run this if bucket already exists but policies are missing
-- Safe to run multiple times (drops existing policies first)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own logos" ON storage.objects;
DROP POLICY IF EXISTS "org members access assets" ON storage.objects;
DROP POLICY IF EXISTS "admin access storage buckets" ON storage.objects;

-- Policy 1: Users can upload their own logos
CREATE POLICY "Users can upload own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'paidly' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Policy 2: Users can read their own logos
CREATE POLICY "Users can read own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'paidly' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Policy 3: Organization members can access org assets
CREATE POLICY "org members access assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'paidly' AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (select auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
)
WITH CHECK (
  bucket_id = 'paidly' AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = (select auth.uid())
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

-- Policy 4: Admin full access
CREATE POLICY "admin access storage buckets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'paidly' AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'paidly' AND public.is_admin()
);

-- Verify policies were created
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'INSERT' THEN 'Upload permission'
    WHEN cmd = 'SELECT' THEN 'Read permission'
    WHEN cmd = 'ALL' THEN 'Full access'
    ELSE cmd
  END as permission_type
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE '%logo%' OR policyname LIKE '%asset%' OR policyname LIKE '%admin%')
ORDER BY policyname;

-- Expected: Should see 4 policies created
