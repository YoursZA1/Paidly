-- Allow product image uploads to paidly bucket under inventory/ path.
-- productImageUpload.js stores files at: inventory/{userId}/{uuid}.{ext}
-- The current INSERT/UPDATE/DELETE policies only permit logo-* and document-logos/* paths,
-- so product image uploads fail with "permission denied".

-- DROP and recreate all three write policies to add the inventory/ path.

DROP POLICY IF EXISTS "Users can upload paidly assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update paidly assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete paidly assets"  ON storage.objects;

-- INSERT: user must be authenticated and path must be logo-*, document-logos/*, or inventory/<own-uid>/*
CREATE POLICY "Users can upload paidly assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'paidly'
  AND (
    name LIKE 'logo-%'
    OR name LIKE 'document-logos/%'
    OR (
      name LIKE 'inventory/%'
      AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  )
);

-- UPDATE: must own the object and stay within allowed paths
CREATE POLICY "Users can update paidly assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'paidly'
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
)
WITH CHECK (
  bucket_id = 'paidly'
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
);

-- DELETE: must own the object
CREATE POLICY "Users can delete paidly assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'paidly'
  AND owner = auth.uid()
  AND (name LIKE 'logo-%' OR name LIKE 'document-logos/%' OR name LIKE 'inventory/%')
);
