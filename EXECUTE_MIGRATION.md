# Execute Migration - Step by Step Guide

Follow these steps to run the migration and verify everything is working.

## 🚀 Quick Start

### Step 1: Run the Migration

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

3. **Copy Migration File**
   - Open `supabase/schema.postgres.sql` in your code editor
   - Select all (Cmd+A / Ctrl+A)
   - Copy (Cmd+C / Ctrl+C)

4. **Paste and Run**
   - Paste into Supabase SQL Editor
   - Click **Run** button (or press Cmd+Enter / Ctrl+Enter)
   - Wait for execution (may take 10-30 seconds)

5. **Check Results**
   - Look for success messages: "CREATE TABLE", "CREATE INDEX", "CREATE POLICY"
   - If you see errors about "already exists", that's OK - tables may already exist
   - If you see other errors, note them and check the troubleshooting section

### Step 2: Verify Tables Created

**Option A: Using Supabase Dashboard**

1. Click **Table Editor** in left sidebar
2. You should see these tables:
   - ✅ `clients`
   - ✅ `services`
   - ✅ `invoices`
   - ✅ `quotes`
   - ✅ `payments`
   - ✅ `organizations`
   - ✅ `memberships`
   - ✅ `profiles`

**Option B: Using SQL Query**

Run this in SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('clients', 'services', 'invoices', 'quotes', 'payments')
ORDER BY table_name;
```

Expected: Should return all 5 table names.

### Step 3: Verify RLS is Enabled

Run this query in SQL Editor:

```sql
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services', 'invoices', 'quotes');
```

**Expected Result:** All should show `rls_enabled = true`

If any show `false`, run:

```sql
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
```

### Step 4: Check RLS Policies

Run this query:

```sql
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services')
ORDER BY tablename, policyname;
```

**Expected:** Should see policies like:
- `admin full access clients`
- `org members select`
- `org members write services`

### Step 5: Verify EntityManager Support

Run this command in your terminal:

```bash
node scripts/check-entity-manager.js
```

**Expected Output:**
```
✅ pullFromSupabase gets org_id from memberships
✅ pullFromSupabase filters clients by org_id
✅ pullFromSupabase filters services by org_id
✅ create() includes org_id
✅ create() handles invoice_items
✅ list() pulls from Supabase
```

### Step 6: Test in Application

1. **Start the app**
   ```bash
   npm run dev
   ```

2. **Log in** as a user

3. **Create a Client**
   - Navigate to Clients page
   - Click "Add Client" or "+" button
   - Fill in:
     - Name: "Test Client"
     - Email: "test@example.com"
     - Phone: "+1-555-0123"
   - Click Save
   - ✅ Verify client appears in the list

4. **Create a Service**
   - Navigate to Services page
   - Click "Add Service" or "+" button
   - Fill in:
     - Name: "Web Development"
     - Item Type: "Service"
     - Default Unit: "hour"
     - Default Rate: "150.00"
   - Click Save
   - ✅ Verify service appears in the list

5. **Verify Organization Isolation** (if you have multiple users)
   - Log in as User 1, create a client
   - Log in as User 2 (different org), verify they don't see User 1's client

## ✅ Verification Checklist

After completing all steps, verify:

- [ ] Migration executed without critical errors
- [ ] All tables exist in Supabase dashboard
- [ ] RLS is enabled on all tables
- [ ] RLS policies exist
- [ ] Can create clients through the app
- [ ] Can create services through the app
- [ ] EntityManager check passes
- [ ] Organization isolation works (if testing with multiple users)

## 🔧 Troubleshooting

### Error: "relation already exists"

**Solution:** This is OK! The migration uses `IF NOT EXISTS` so it's safe to run multiple times.

### Error: "permission denied" when testing

**Solution:** This means RLS is working! Make sure you're:
- Logged in to the app
- Using authenticated API calls
- Testing through the app UI, not raw SQL

### Tables don't appear in dashboard

**Solution:**
1. Refresh the Supabase dashboard
2. Check SQL Editor for any errors
3. Verify you're looking at the correct project
4. Run the table verification query

### Can't create clients/services in app

**Solution:**
1. Check browser console for errors
2. Verify you're logged in
3. Check Network tab for API errors
4. Verify `org_id` is being set (check Supabase logs)

### EntityManager check fails

**Solution:**
1. Review `src/api/customClient.js`
2. Ensure `pullFromSupabase()` gets `org_id` from memberships
3. Ensure `create()` includes `org_id`
4. Ensure `list()` calls `pullFromSupabase()`

## 📊 Quick Verification Queries

Run these in Supabase SQL Editor to quickly verify setup:

### Check table counts (should be 0 for new setup)
```sql
SELECT 
  'clients' as table_name, COUNT(*) as count FROM public.clients
UNION ALL
SELECT 'services', COUNT(*) FROM public.services
UNION ALL
SELECT 'invoices', COUNT(*) FROM public.invoices
UNION ALL
SELECT 'quotes', COUNT(*) FROM public.quotes;
```

### Check indexes exist
```sql
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('clients', 'services')
  AND indexname LIKE 'idx_%';
```

### Check triggers exist
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('clients', 'services', 'profiles');
```

## 🎉 Success!

If all checks pass, your database is ready! You can now:

1. Create clients and services through the app
2. Create invoices and quotes
3. All data will be automatically filtered by organization
4. RLS ensures users only see their organization's data

## 📚 Additional Resources

- `DATABASE_TABLES_SETUP.md` - Detailed schema documentation
- `DATABASE_QUICK_REFERENCE.md` - Quick code examples
- `MIGRATION_GUIDE.md` - Comprehensive migration guide
- `scripts/test-rls-policies.sql` - RLS test queries
