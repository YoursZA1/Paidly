-- Allow JPEG logos in company-logos (Settings logo upload)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml']::text[]
WHERE id = 'company-logos';
