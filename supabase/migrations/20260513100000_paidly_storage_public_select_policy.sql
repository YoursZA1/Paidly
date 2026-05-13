-- Defensive public SELECT policy for the paidly storage bucket.
-- For public=true buckets, Supabase serves objects via CDN without requiring RLS.
-- This policy ensures reads also work via the authenticated/anon Postgrest paths
-- in case RLS enforcement on storage.objects is stricter than default.
-- Idempotent: safe to run repeatedly.

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
