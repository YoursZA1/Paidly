# Fix "Failed to save client" Error

## 🔍 Common Causes

### 1. No Organization Found (Most Common)

**Error:** "No organization found for user"

**Solution:**
- User needs to have a membership record
- This is usually created automatically when user signs up
- If missing, run this SQL:

```sql
-- Check if user has membership
SELECT m.*, o.name as org_name
FROM public.memberships m
JOIN public.organizations o ON o.id = m.org_id
WHERE m.user_id = auth.uid();

-- If no membership, create one (replace USER_ID with actual user ID)
INSERT INTO public.memberships (org_id, user_id, role)
SELECT o.id, 'USER_ID_HERE', 'owner'
FROM public.organizations o
WHERE o.owner_id = 'USER_ID_HERE'
LIMIT 1;
```

### 2. Database Schema Mismatch

**Error:** "column X does not exist" or "relation does not"

**Solution:**
- **Quick fix:** Run `scripts/ensure-clients-schema.sql` in the Supabase SQL Editor to add any missing columns to the `clients` table.
- **Full setup:** If the `clients` table does not exist, run the full migration: `supabase/schema.postgres.sql`, then run `scripts/ensure-clients-schema.sql` if needed.

**Check table:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clients' 
ORDER BY ordinal_position;
```

**Expected columns:**
- id, org_id, name, email, phone, address
- contact_person, website, tax_id, fax
- alternate_email, notes, internal_notes
- industry, payment_terms, payment_terms_days
- follow_up_enabled, created_at, updated_at

### 3. RLS Policy Blocking Insert

**Error:** "permission denied" or "new row violates row-level security"

**Solution:**
- Verify RLS policies exist
- Check user is authenticated
- Run this to check policies:

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clients';
```

**Expected:** Should see policies like:
- "org members select"
- "org members write"

### 4. Missing Required Fields

**Error:** "null value in column X violates not-null constraint"

**Solution:**
- Ensure `name` field is filled (required)
- Check form validation

## 🔧 Quick Fixes

### Fix 1: Check User Membership

Run in Supabase SQL Editor:

```sql
-- Check current user's membership
SELECT 
  u.id as user_id,
  u.email,
  m.org_id,
  o.name as org_name,
  m.role
FROM auth.users u
LEFT JOIN public.memberships m ON m.user_id = u.id
LEFT JOIN public.organizations o ON o.id = m.org_id
WHERE u.id = auth.uid();
```

**If no membership found:**
- User needs to sign up again, OR
- Create membership manually (see above)

### Fix 2: Verify Clients Table

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'clients'
);

-- Check columns
\d public.clients
```

### Fix 3: Test Insert Manually

```sql
-- Test insert (replace with your org_id)
INSERT INTO public.clients (org_id, name, email)
VALUES (
  'YOUR_ORG_ID_HERE',
  'Test Client',
  'test@example.com'
)
RETURNING *;
```

## 🐛 Debug Steps

1. **Open Browser Console** (F12)
2. **Try to save client**
3. **Check console for error details**
4. **Look for:**
   - "No organization found" → Fix membership
   - "column does not exist" → Run migration
   - "permission denied" → Check RLS policies
   - "null value" → Check required fields

## ✅ Updated Error Messages

The code now shows more helpful error messages:
- "No organization found" → Clear message about membership
- "Permission denied" → Clear message about RLS
- "Database schema mismatch" → Clear message about migration
- Other errors → Shows actual error message

## 🧪 Test After Fix

1. **Refresh app** (F5)
2. **Go to Clients page**
3. **Click "Add Client"**
4. **Fill in:**
   - Name: "Test Client" (required)
   - Email: "test@example.com" (required)
5. **Click Save**
6. **Should work!** ✅

## 📋 Checklist

- [ ] User has membership record
- [ ] Clients table exists with all columns
- [ ] RLS policies are set up
- [ ] User is authenticated
- [ ] Required fields (name, email) are filled
- [ ] Migration SQL has been run

## 🆘 Still Not Working?

1. **Check browser console** for full error
2. **Check Network tab** for API response
3. **Check Supabase logs** in dashboard
4. **Share the exact error message** from console
