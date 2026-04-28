-- Ensure company-logos matches production logo flow:
-- - Public bucket for deterministic public URLs
-- - MIME allowlist includes PNG/JPEG/SVG
-- - Authenticated users can manage objects in this bucket (UUID file names supported)

UPDATE storage.buckets
SET
  public = true,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml']::text[]
WHERE id = 'company-logos';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload company logo'
  ) THEN
    DROP POLICY "Users can upload company logo" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update company logo'
  ) THEN
    DROP POLICY "Users can update company logo" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete company logo'
  ) THEN
    DROP POLICY "Users can delete company logo" ON storage.objects;
  END IF;
END $$;

CREATE POLICY "Users can upload company logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Users can update company logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'company-logos')
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Users can delete company logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'company-logos');
