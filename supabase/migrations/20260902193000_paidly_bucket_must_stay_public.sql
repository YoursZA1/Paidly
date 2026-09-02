-- Logos are loaded with getPublicUrl (/storage/v1/object/public/paidly/...).
-- If this bucket is private, that endpoint returns HTTP 400 + "Bucket not found"
-- even when the object exists. Applying schema.postgres.sql used to flip public=false.
-- Invoice/quote/profile logos must stay publicly readable.

UPDATE storage.buckets
SET public = true
WHERE id = 'paidly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can read paidly assets'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public can read paidly assets"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'paidly')
    $policy$;
  END IF;
END $$;
