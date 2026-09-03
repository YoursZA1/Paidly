-- DEPRECATED. Do not run the old policy-create section in this file.
--
-- It expected uid-first-segment policies on paidly and would DROP/recreate
-- org + admin policies scoped only to paidly, dropping logo-% / public-read.
--
-- Verify against the canonical dump instead:
--   supabase/schema.postgres.sql
--   docs/SUPABASE_STORAGE.md
--
-- Expected paidly row:
--   public = true
--
-- Expected paidly policies (among others):
--   "Public can read paidly assets"          SELECT  anon, authenticated
--   "Users can upload paidly assets"         INSERT  authenticated, name LIKE logo-% | document-logos/% | inventory/{uid}/%
--   "Users can update paidly assets"         UPDATE  owner + allowed paths
--   "Users can delete paidly assets"         DELETE  owner + allowed paths

SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('paidly', 'profile-logos', 'activities', 'bank-details', 'receipts')
ORDER BY id;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
