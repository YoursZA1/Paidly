-- Logo URL for company / profile branding
-- If you have a separate "companies" table, run: ALTER TABLE companies ADD COLUMN logo_url TEXT;

-- Ensure profiles has logo_url (e.g. DBs created before this column existed)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add logo_url to organizations (company-level logo in this schema)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Storage: company-logos bucket for uploadLogo() (public so getPublicUrl works)
-- Logo constraints: PNG or SVG, max 500KB, recommended width 300px, aspect ratio flexible
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  512000,
  ARRAY['image/png', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: users can upload/update/delete only their own logo (filename: logo-<auth.uid()>.*)
DROP POLICY IF EXISTS "Users can upload company logo" ON storage.objects;
CREATE POLICY "Users can upload company logo" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos' AND name LIKE 'logo-' || (auth.uid())::text || '.%'
  );

DROP POLICY IF EXISTS "Users can update company logo" ON storage.objects;
CREATE POLICY "Users can update company logo" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND name LIKE 'logo-' || (auth.uid())::text || '.%')
  WITH CHECK (bucket_id = 'company-logos' AND name LIKE 'logo-' || (auth.uid())::text || '.%');

DROP POLICY IF EXISTS "Users can delete company logo" ON storage.objects;
CREATE POLICY "Users can delete company logo" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND name LIKE 'logo-' || (auth.uid())::text || '.%');
