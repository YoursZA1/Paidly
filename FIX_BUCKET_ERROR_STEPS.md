# Fix "Bucket not found" Error - Step by Step

## 🎯 Quick Fix (2 minutes)

### Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query** button

### Step 2: Run the SQL Script

1. Open the file `CREATE_BUCKET_NOW.sql` in your project
2. **Copy the entire contents** (Cmd+A, Cmd+C / Ctrl+A, Ctrl+C)
3. **Paste into Supabase SQL Editor**
4. Click **Run** button (or press Cmd+Enter / Ctrl+Enter)
5. Wait for execution (should take 1-2 seconds)

### Step 3: Verify Bucket Created

After running, you should see:
- ✅ A row showing the bucket was created
- ✅ 4 policies were created

### Step 4: Test Logo Upload

1. Go back to your app
2. Refresh the page (F5)
3. Go to Settings
4. Try uploading a logo again
5. **Should work now!** ✅

## 🔍 Alternative: Create via Dashboard

If SQL doesn't work, use the dashboard:

1. **Supabase Dashboard** → **Storage**
2. Click **"New bucket"** or **"Create bucket"**
3. Fill in:
   - **Name**: `invoicebreek` (exactly this, case-sensitive)
   - **Public**: **No** (unchecked/private)
   - **File size limit**: 50 MB (optional)
4. Click **Create**
5. Try uploading logo again

## ✅ What the SQL Script Does

1. **Creates bucket** `invoicebreek` if it doesn't exist
2. **Sets bucket as private** (uses signed URLs)
3. **Sets file size limit** to 50MB
4. **Allows image types**: jpeg, png, gif, webp, svg, pdf
5. **Creates RLS policies**:
   - Users can upload their own logos
   - Users can read their own logos
   - Org members can access org assets
   - Admins have full access

## 🧪 Verify It Worked

Run this query in SQL Editor:

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'invoicebreek';
```

**Expected:** Should return 1 row with `id = 'invoicebreek'`

## 🆘 Still Not Working?

### Check These:

1. **Bucket name**: Must be exactly `invoicebreek` (lowercase, no spaces)
2. **Project**: Make sure you're in the correct Supabase project
3. **Refresh**: Refresh your app after creating bucket
4. **Console errors**: Check browser console for other errors
5. **Network tab**: Check Network tab to see the actual API call

### Common Issues:

**"Bucket still not found"**
- Wait 5 seconds and try again (sometimes takes a moment)
- Refresh Supabase dashboard
- Double-check bucket name is exactly `invoicebreek`

**"Permission denied"**
- Make sure you ran the RLS policies part of the SQL
- Check that user is logged in
- Verify policies exist: Run `SELECT * FROM pg_policies WHERE tablename = 'objects';`

**"Different error"**
- Check browser console (F12)
- Check Network tab for API errors
- Share the exact error message

## 📋 Files Created

- ✅ `CREATE_BUCKET_NOW.sql` - Ready-to-run SQL script
- ✅ `FIX_BUCKET_ERROR_STEPS.md` - This guide
- ✅ `QUICK_FIX_BUCKET_ERROR.md` - Quick reference
- ✅ `scripts/create-storage-buckets.sql` - Alternative script

## 🎉 Success!

Once the bucket is created, logo uploads will work immediately. The app will:
- Upload logo to `invoicebreek` bucket
- Generate signed URL (valid 1 year)
- Save URL to user profile
- Display logo in invoices, quotes, and settings
