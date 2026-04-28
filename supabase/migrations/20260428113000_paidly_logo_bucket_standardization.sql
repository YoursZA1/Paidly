-- Standardize logo asset bucket to "paidly"
-- - Public bucket
-- - MIME types: PNG, JPEG, SVG
-- - Non-restrictive authenticated policies for paidly objects

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'paidly',
  'paidly',
  true,
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml']::text[];

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
WITH CHECK (bucket_id = 'paidly');

CREATE POLICY "Users can update paidly assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'paidly')
WITH CHECK (bucket_id = 'paidly');

CREATE POLICY "Users can delete paidly assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'paidly');
