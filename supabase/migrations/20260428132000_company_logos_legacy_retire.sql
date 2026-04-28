-- Retire legacy company-logos runtime usage after successful migration to paidly.
-- Safe cleanup:
-- - Remove old object policies
-- - Mark bucket private and lock MIME list to none (no further writes expected)

DROP POLICY IF EXISTS "Users can upload company logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update company logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete company logo" ON storage.objects;

UPDATE storage.buckets
SET
  public = false,
  allowed_mime_types = ARRAY[]::text[]
WHERE id = 'company-logos';
