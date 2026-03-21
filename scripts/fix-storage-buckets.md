# Fix Storage Bucket "Not Found" Error

## Problem
Error: `Failed to upload logo: Bucket not found`

## Solution

### Option 1: Create Buckets via Supabase Dashboard (Easiest)

1. **Open Supabase Dashboard**
   - Go to your project → **Storage** section

2. **Create Main Bucket**
   - Click **"New bucket"** or **"Create bucket"**
   - Name: `paidly`
   - Public: **No** (Private)
   - File size limit: 50 MB
   - Click **Create**

3. **Create Profile Logos Bucket** (Optional but recommended)
   - Click **"New bucket"** again
   - Name: `profile-logos`
   - Public: **No** (Private)
   - File size limit: 5 MB
   - Click **Create**

### Option 2: Create Buckets via SQL (Recommended)

1. **Open Supabase SQL Editor**
   - Go to **SQL Editor** → **New Query**

2. **Run Bucket Creation Script**
   - Copy contents of `scripts/create-storage-buckets.sql`
   - Paste and click **Run**
   - Verify buckets appear in Storage section

### Option 3: Use Migration SQL

The main migration (`supabase/schema.postgres.sql`) now includes bucket creation. If you haven't run it yet:

1. Run the full migration: `supabase/schema.postgres.sql`
2. Buckets will be created automatically

## Verify Buckets Exist

Run this query in SQL Editor:

```sql
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('paidly', 'profile-logos');
```

**Expected:** Should return 1-2 rows showing the buckets.

## Set Up RLS Policies

After creating buckets, set up RLS policies:

### Policy 1: Allow authenticated users to upload their own logos

```sql
CREATE POLICY "Users can upload own logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('paidly', 'profile-logos') AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### Policy 2: Allow authenticated users to read their own logos

```sql
CREATE POLICY "Users can read own logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('paidly', 'profile-logos') AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### Policy 3: Allow organization members to access org files

```sql
CREATE POLICY "Org members access assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id IN ('paidly', 'profile-logos') AND
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND (storage.foldername(name))[1] = m.org_id::text
  )
)
WITH CHECK (
  bucket_id IN ('paidly', 'profile-logos') AND
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND (storage.foldername(name))[1] = m.org_id::text
  )
);
```

### Policy 4: Admin full access

```sql
CREATE POLICY "Admin access storage buckets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id IN ('paidly', 'profile-logos') AND
  public.is_admin()
)
WITH CHECK (
  bucket_id IN ('paidly', 'profile-logos') AND
  public.is_admin()
);
```

## Test Logo Upload

After creating buckets and policies:

1. **Start your app**: `npm run dev`
2. **Log in** as a user
3. **Go to Settings** → Upload logo
4. **Select an image** and upload
5. **Verify**: Logo should upload successfully

## Troubleshooting

### Still getting "Bucket not found"

1. **Check bucket name**: Verify it's exactly `paidly` (case-sensitive)
2. **Refresh Supabase dashboard**: Sometimes UI needs refresh
3. **Check environment variable**: Verify `VITE_SUPABASE_STORAGE_BUCKET` if set
4. **Check Supabase project**: Make sure you're in the correct project

### "Permission denied" error

1. **Check RLS policies**: Make sure policies are created (see above)
2. **Check user authentication**: Make sure user is logged in
3. **Check user ID**: Verify `auth.uid()` matches the user uploading

### Logo uploads but doesn't display

1. **Check signed URL generation**: Verify signed URL is created
2. **Check logo_url in profiles table**: Verify URL is saved
3. **Check LogoImage component**: Verify it handles the URL format

## Updated Code

The `SupabaseStorageService` has been updated to:
- ✅ Try `profile-logos` bucket first, fallback to `paidly`
- ✅ Check if bucket exists before upload
- ✅ Provide helpful error messages if bucket doesn't exist
- ✅ Better error handling and logging

## Next Steps

1. ✅ Create buckets (choose one method above)
2. ✅ Set up RLS policies (copy SQL above)
3. ✅ Test logo upload in app
4. ✅ Verify logo displays correctly
