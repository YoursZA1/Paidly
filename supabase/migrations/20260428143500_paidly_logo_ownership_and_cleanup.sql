-- Harden paidly logo policies with ownership constraints and clean migration helper.
-- Ownership guard: only object owners can update/delete.
-- Insert guard: only authenticated users, logo path patterns only.

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
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
)
WITH CHECK (
  bucket_id = 'paidly'
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
);

CREATE POLICY "Users can delete paidly assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'paidly'
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%')
);

-- Cleanup helper function used only for one-time normalization migration.
DROP FUNCTION IF EXISTS public.normalize_logo_path(text);
