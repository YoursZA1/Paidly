-- Ensure paidly bucket explicitly accepts PNG/JPEG variants.
-- Some clients send image/jpg instead of image/jpeg.

UPDATE storage.buckets
SET
  public = true,
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/svg+xml'
  ]::text[]
WHERE id = 'paidly';

