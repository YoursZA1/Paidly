-- Tighten paidly bucket policies to logo-specific object paths.
-- Keeps current upload shapes:
-- - logo-<uuid>.<ext>
-- - document-logos/<user-id>/<uuid>.<ext>

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload paidly assets'
  ) THEN
    DROP POLICY "Users can upload paidly assets" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can update paidly assets'
  ) THEN
    DROP POLICY "Users can update paidly assets" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete paidly assets'
  ) THEN
    DROP POLICY "Users can delete paidly assets" ON storage.objects;
  END IF;
END $$;

CREATE POLICY "Users can upload paidly assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'paidly'
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
);

CREATE POLICY "Users can update paidly assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'paidly'
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
)
WITH CHECK (
  bucket_id = 'paidly'
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
);

CREATE POLICY "Users can delete paidly assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'paidly'
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
);
