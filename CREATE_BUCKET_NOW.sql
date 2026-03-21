-- ============================================
-- CREATE STORAGE BUCKET FOR LOGO UPLOADS
-- ============================================
-- Copy this entire file and run in Supabase SQL Editor
-- This will create the 'paidly' bucket needed for logo uploads

-- Create the main storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'paidly',
  'paidly',
  false, -- Private bucket (use signed URLs)
  52428800, -- 50MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Verify bucket was created
SELECT 
  id, 
  name, 
  public, 
  file_size_limit,
  created_at
FROM storage.buckets 
WHERE id = 'paidly';

-- Expected result: Should see 1 row with the bucket details

-- ============================================
-- SET UP RLS POLICIES FOR LOGO UPLOADS
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
  bucket_id = 'paidly' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Users can read their own logos
CREATE POLICY "Users can read own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'paidly' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Organization members can access org assets
CREATE POLICY "org members access assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'paidly' AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND (storage.foldername(name))[1] = m.org_id::text
  )
)
WITH CHECK (
  bucket_id = 'paidly' AND EXISTS (
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
  bucket_id = 'paidly' AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'paidly' AND public.is_admin()
);

-- Verify policies were created
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (policyname LIKE '%logo%' OR policyname LIKE '%asset%' OR policyname LIKE '%admin%')
ORDER BY policyname;

-- Expected: Should see 4 policies created

-- ============================================
-- DONE! You can now upload logos.
-- ============================================
