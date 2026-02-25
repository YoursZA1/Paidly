# Logo Upload & Display Fix - Complete

## Summary
Fixed logo upload, storage, and display functionality to properly work with Supabase Storage and database persistence.

## Changes Made

### 1. Database Schema Updates (`supabase/schema.postgres.sql`)
- Added `logo_url`, `company_name`, `company_address`, `currency`, `timezone`, `invoice_template`, `invoice_header` columns to `profiles` table
- Added `updated_at` timestamp column
- Updated `handle_new_user()` trigger to include new fields

**Action Required:** Run the SQL migration in your Supabase SQL editor:
```sql
-- Add new columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS invoice_template text DEFAULT 'classic',
ADD COLUMN IF NOT EXISTS invoice_header text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Update trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, logo_url, company_name, company_address, currency, timezone)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'logo_url',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'company_address',
    COALESCE(new.raw_user_meta_data->>'currency', 'USD'),
    COALESCE(new.raw_user_meta_data->>'timezone', 'UTC')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    logo_url = COALESCE(excluded.logo_url, profiles.logo_url),
    company_name = COALESCE(excluded.company_name, profiles.company_name),
    company_address = COALESCE(excluded.company_address, profiles.company_address),
    currency = COALESCE(excluded.currency, profiles.currency),
    timezone = COALESCE(excluded.timezone, profiles.timezone),
    updated_at = now();

  INSERT INTO public.organizations (name, owner_id)
  VALUES (COALESCE(new.raw_user_meta_data->>'org_name', 'My Organization'), new.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (new_org_id, new.id, 'owner');

  RETURN new;
END;
$$;
```

### 2. User Data Persistence (`src/api/customClient.js`)
- **`User.updateMyUserData()`**: Now saves logo_url and company data to Supabase `profiles` table via upsert
- **`User.me()`**: Now loads logo_url and company data from Supabase `profiles` table on every call
- **`User.login()`**: Loads profile data from Supabase first, falls back to localStorage

### 3. Logo Upload Service (`src/services/SupabaseStorageService.js`)
- Enhanced `uploadProfileLogo()` to create signed URLs (valid for 1 year)
- Added `refreshSignedUrl()` method to refresh expired signed URLs
- Added `getSignedUrl()` helper method
- Proper error handling with fallback to public URLs

### 4. Logo Display Component (`src/components/shared/LogoImage.jsx`)
- New reusable component that:
  - Handles signed URLs, public URLs, blob URLs, and storage paths
  - Auto-refreshes expired signed URLs
  - Shows loading state while fetching
  - Gracefully handles errors

### 5. Updated All Logo Displays
Replaced `<img>` tags with `<LogoImage>` component in:
- `src/pages/ViewInvoice.jsx`
- `src/pages/ViewQuote.jsx`
- `src/pages/Settings.jsx` (for saved logos, blob previews still use `<img>`)
- `src/components/invoice/templates/BoldTemplate.jsx`
- `src/components/invoice/templates/ModernTemplate.jsx`
- `src/components/invoice/templates/ClassicTemplate.jsx`
- `src/components/invoice/templates/MinimalTemplate.jsx`
- `src/components/quote/QuotePreview.jsx`

## How It Works Now

### Upload Flow:
1. User selects logo file in Settings
2. File is uploaded to Supabase Storage bucket (`invoicebreek`) at path `{userId}/logo.{ext}`
3. Signed URL is generated (valid for 1 year)
4. Signed URL is saved to `profiles.logo_url` in Supabase
5. User data is refreshed to show new logo

### Display Flow:
1. Component receives `logo_url` from user/company object
2. `LogoImage` component checks if URL is:
   - Blob URL → Use directly (for previews)
   - Signed URL → Try to load, refresh if expired
   - Public URL → Use directly
   - Storage path → Generate signed URL
3. Logo displays correctly in invoices, quotes, and profile

## Testing Checklist

- [ ] Run SQL migration in Supabase dashboard
- [ ] Upload logo in Settings page
- [ ] Verify logo appears in Settings preview
- [ ] Create/View invoice - verify logo displays
- [ ] Create/View quote - verify logo displays
- [ ] Check Supabase Storage bucket has uploaded file
- [ ] Check Supabase `profiles` table has `logo_url` value
- [ ] Refresh page - verify logo persists
- [ ] Logout/login - verify logo loads from Supabase

## Storage Bucket Configuration

Ensure your Supabase Storage bucket (`invoicebreek`) has:
- **Public read access** OR **Signed URL access** enabled
- RLS policies allowing authenticated users to upload/read their own files

Example RLS policy:
```sql
-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoicebreek' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own logos
CREATE POLICY "Users can read own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoicebreek' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

## Notes

- Signed URLs expire after 1 year - `LogoImage` component auto-refreshes them
- Logo data is now persisted in Supabase, not just localStorage
- All invoice/quote templates now use the same logo display logic
- Profile logos work the same way as invoice/quote logos
