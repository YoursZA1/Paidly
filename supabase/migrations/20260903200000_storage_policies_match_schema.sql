-- Converge storage RLS with supabase/schema.postgres.sql.
-- The dump used to ship only uid/org-path policies. Pasting it without
-- these statements left logo-{uuid} uploads failing and omitted public read.
-- Do not run CREATE_BUCKET_NOW.sql / VERIFY_BUCKET_SETUP.sql instead of this.

UPDATE storage.buckets
SET public = true
WHERE id = 'paidly';

-- Public invoice/quote viewers load logos via getPublicUrl (no signed URL).
DROP POLICY IF EXISTS "Public can read paidly assets" ON storage.objects;
CREATE POLICY "Public can read paidly assets"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'paidly');

DROP POLICY IF EXISTS "Users can upload paidly assets" ON storage.objects;
CREATE POLICY "Users can upload paidly assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'paidly'
    AND (
      name LIKE 'logo-%'
      OR name LIKE 'document-logos/%'
      OR name LIKE 'inventory/' || (SELECT auth.uid())::text || '/%'
    )
  );

DROP POLICY IF EXISTS "Users can update paidly assets" ON storage.objects;
CREATE POLICY "Users can update paidly assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'paidly'
    AND owner = (SELECT auth.uid())
    AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
  )
  WITH CHECK (
    bucket_id = 'paidly'
    AND owner = (SELECT auth.uid())
    AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
  );

DROP POLICY IF EXISTS "Users can delete paidly assets" ON storage.objects;
CREATE POLICY "Users can delete paidly assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'paidly'
    AND owner = (SELECT auth.uid())
    AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
  );

-- Legacy profile-logos only. paidly logos are logo-{uuid}, not {uid}/logo.ext.
DROP POLICY IF EXISTS "Users can upload own logos" ON storage.objects;
CREATE POLICY "Users can upload own logos" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can read own logos" ON storage.objects;
CREATE POLICY "Users can read own logos" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update delete own storage" ON storage.objects;
CREATE POLICY "Users can update delete own storage" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'profile-logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own storage" ON storage.objects;
CREATE POLICY "Users can delete own storage" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-logos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
