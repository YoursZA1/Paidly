-- Store receipt images in Supabase Storage (receipt-{timestamp}.jpg)
-- Path: org_id/receipt-{Date.now()}.{ext} for RLS

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Org members can upload/read/update/delete receipts under their org path
DROP POLICY IF EXISTS "org members insert receipts" ON storage.objects;
CREATE POLICY "org members insert receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts' AND exists (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid()) AND (storage.foldername(name))[1] = m.org_id::text
    )
  );

DROP POLICY IF EXISTS "org members select receipts" ON storage.objects;
CREATE POLICY "org members select receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts' AND exists (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid()) AND (storage.foldername(name))[1] = m.org_id::text
    )
  );

DROP POLICY IF EXISTS "org members update receipts" ON storage.objects;
CREATE POLICY "org members update receipts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts' AND exists (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid()) AND (storage.foldername(name))[1] = m.org_id::text
    )
  );

DROP POLICY IF EXISTS "org members delete receipts" ON storage.objects;
CREATE POLICY "org members delete receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts' AND exists (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid()) AND (storage.foldername(name))[1] = m.org_id::text
    )
  );

DROP POLICY IF EXISTS "admin full access receipts" ON storage.objects;
CREATE POLICY "admin full access receipts" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin())
  WITH CHECK (bucket_id = 'receipts' AND public.is_admin());
