# Quick Fix: "Bucket not found" Error

## 🚨 Problem
When uploading a logo, you get: `Failed to upload logo: Bucket not found`

## ✅ Solution (Choose One)

### Option 1: Create Bucket via Dashboard (2 minutes) ⭐ RECOMMENDED

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Click **Storage** in left sidebar

2. **Create Bucket**
   - Click **"New bucket"** button
   - Name: `paidly` (exactly this, case-sensitive)
   - Public: **No** (keep it private)
   - Click **Create**

3. **Done!** Try uploading logo again.

### Option 2: Create Bucket via SQL (1 minute)

1. **Open Supabase SQL Editor**
   - Go to **SQL Editor** → **New Query**

2. **Run This SQL:**
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit)
   VALUES ('paidly', 'paidly', false, 52428800)
   ON CONFLICT (id) DO NOTHING;
   ```

3. **Click Run**

4. **Done!** Try uploading logo again.

### Option 3: Run Full Migration (5 minutes)

If you haven't run the database migration yet:

1. Open `supabase/schema.postgres.sql`
2. Copy entire file
3. Paste in Supabase SQL Editor
4. Click Run
5. This creates buckets AND sets up all policies

## 🔍 Verify Bucket Exists

Run this query in SQL Editor:

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'paidly';
```

**Expected:** Should return 1 row with `id = 'paidly'`

## 🧪 Test Logo Upload

1. **Start your app**: `npm run dev`
2. **Log in**
3. **Go to Settings**
4. **Upload a logo**
5. **Should work now!** ✅

## 📋 What Was Fixed

1. ✅ **Schema updated** - Buckets are created automatically in migration
2. ✅ **Storage service improved** - Better error messages and bucket checking
3. ✅ **Policies added** - Users can upload their own logos
4. ✅ **Fallback bucket** - Tries `profile-logos` first, then `paidly`

## 🆘 Still Not Working?

### Check These:

1. **Bucket name**: Must be exactly `paidly` (case-sensitive)
2. **Project**: Make sure you're in the correct Supabase project
3. **Environment variable**: Check `.env` for `VITE_SUPABASE_STORAGE_BUCKET`
4. **Browser console**: Check for other errors
5. **Network tab**: See the actual API error

### Common Issues:

**"Permission denied"**
- Need to set up RLS policies (run the full migration SQL)

**"Bucket exists but upload fails"**
- Check RLS policies allow authenticated users
- Verify user is logged in

**"Different error message"**
- Check browser console for full error
- Check Network tab for API response

## 📚 More Help

- See `scripts/fix-storage-buckets.md` for detailed setup
- See `scripts/create-storage-buckets.sql` for bucket creation SQL
- See `supabase/schema.postgres.sql` for full migration
