-- ============================================
-- VERIFY BUCKET SETUP
-- ============================================
-- Run this to check if bucket and policies are set up correctly

-- 1. Check if bucket exists
SELECT 
  id, 
  name, 
  public, 
  file_size_limit,
  created_at
FROM storage.buckets 
WHERE id = 'invoicebreek';

-- Expected: Should see 1 row with bucket details

-- 2. Check if RLS policies exist
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
  AND bucket_id = 'invoicebreek'
ORDER BY policyname;

-- Expected: Should see policies like:
-- - "Users can upload own logos" (INSERT)
-- - "Users can read own logos" (SELECT)
-- - "org members access assets" (ALL)
-- - "admin access storage buckets" (ALL)

-- 3. If policies are missing, run the policy creation section below

-- ============================================
-- CREATE RLS POLICIES (if missing)
-- ============================================

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Users can upload own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own logos" ON storage.objects;
DROP POLICY IF EXISTS "org members access assets" ON storage.objects;
DROP POLICY IF EXISTS "admin access storage buckets" ON storage.objects;

-- Policy 1: Users can upload their own logos
CREATE POLICY "Users can upload own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoicebreek' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Users can read their own logos
CREATE POLICY "Users can read own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoicebreek' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Organization members can access org assets
CREATE POLICY "org members access assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'invoicebreek' AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND (storage.foldername(name))[1] = m.org_id::text
  )
)
WITH CHECK (
  bucket_id = 'invoicebreek' AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);

-- Policy 4: Admin full access
CREATE POLICY "admin access storage buckets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'invoicebreek' AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'invoicebreek' AND public.is_admin()
);

-- Verify policies were created
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE '%logo%' OR policyname LIKE '%asset%' OR policyname LIKE '%admin%')
ORDER BY policyname;

-- Expected: Should see 4 policies
