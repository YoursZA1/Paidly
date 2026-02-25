# Database Migration Guide

This guide walks you through running the database migration and verifying everything is set up correctly.

## Step 1: Run the Migration

### Option A: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor** in the left sidebar

2. **Create New Query**
   - Click **New Query** button
   - Copy the entire contents of `supabase/schema.postgres.sql`
   - Paste into the SQL editor

3. **Execute Migration**
   - Click **Run** or press `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac)
   - Wait for execution to complete
   - Check for any errors in the results panel

4. **Verify Success**
   - Look for messages like "CREATE TABLE", "CREATE INDEX", "CREATE POLICY"
   - If you see errors, check:
     - Tables might already exist (this is OK - `IF NOT EXISTS` handles this)
     - RLS policies might already exist (this is OK)
     - Triggers might already exist (this is OK)

### Option B: Supabase CLI

If you have Supabase CLI installed:

```bash
# Make sure you're logged in
supabase login

# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Run the migration
supabase db push

# Or apply the SQL file directly
psql -h db.your-project.supabase.co -U postgres -d postgres -f supabase/schema.postgres.sql
```

## Step 2: Verify Tables Are Created

### In Supabase Dashboard

1. **Navigate to Table Editor**
   - Go to **Table Editor** in the left sidebar
   - You should see these tables:
     - ✅ `clients`
     - ✅ `services`
     - ✅ `invoices`
     - ✅ `quotes`
     - ✅ `payments`
     - ✅ `organizations`
     - ✅ `memberships`
     - ✅ `profiles`

2. **Check Table Structure**
   - Click on `clients` table
   - Verify columns: `id`, `org_id`, `name`, `email`, `phone`, `address`, `contact_person`, `website`, `tax_id`, `payment_terms`, `created_at`, `updated_at`
   
   - Click on `services` table
   - Verify columns: `id`, `org_id`, `name`, `item_type`, `default_unit`, `default_rate`, `tax_category`, `is_active`, etc.

### Using Verification Script

Run the Node.js verification script:

```bash
node scripts/verify-database-setup.js
```

This will check:
- ✅ Tables exist
- ✅ Columns are correct
- ✅ RLS is enabled
- ✅ Data operations are protected

## Step 3: Test Row Level Security (RLS)

### Test 1: Verify RLS is Enabled

Run this query in Supabase SQL Editor:

```sql
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services', 'invoices', 'quotes');
```

**Expected Result:** All tables should show `rls_enabled = true`

### Test 2: Check Policies Exist

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

**Expected Result:** Should see policies like:
- `admin full access clients`
- `org members select`
- `org members write services`

### Test 3: Test Organization Isolation

1. **Create Test Users**
   - Create two test users in Supabase Auth
   - Assign them to different organizations

2. **Test Data Access**
   - Log in as User 1
   - Create a client
   - Log in as User 2
   - Try to query clients - should only see User 2's org clients
   - User 2 should NOT see User 1's clients

### Test 4: Use Test Script

Run the RLS test queries from `scripts/test-rls-policies.sql`:

1. Open Supabase SQL Editor
2. Copy queries from `scripts/test-rls-policies.sql`
3. Run each section
4. Verify results match expectations

## Step 4: Verify EntityManager Support

The `EntityManager` in `src/api/customClient.js` already supports these tables with org_id filtering. Verify:

### Check EntityManager Code

1. **Open** `src/api/customClient.js`
2. **Verify** `pullFromSupabase()` method:
   - ✅ Gets user's `org_id` from memberships
   - ✅ Filters queries by `org_id`
   - ✅ Handles `clients` and `services` tables

3. **Verify** `create()` method:
   - ✅ Automatically includes `org_id`
   - ✅ Sets `created_by` field
   - ✅ Handles invoice_items/quote_items

4. **Verify** `list()` method:
   - ✅ Always pulls fresh from Supabase
   - ✅ Filters by `org_id`

### Test in Application

1. **Start the application**
   ```bash
   npm run dev
   ```

2. **Log in** as a user

3. **Create a Client**
   - Go to Clients page
   - Click "Add Client"
   - Fill in form and save
   - Verify client appears in list

4. **Create a Service**
   - Go to Services page
   - Click "Add Service"
   - Fill in form (select item_type: service/product/labor/etc.)
   - Save
   - Verify service appears in list

5. **Verify Organization Isolation**
   - Log in as different user (different org)
   - Verify they don't see the previous user's clients/services

## Troubleshooting

### Error: "relation does not exist"

**Solution:** The migration didn't run successfully. Re-run `supabase/schema.postgres.sql`

### Error: "permission denied"

**Solution:** RLS is working correctly! Make sure you're authenticated when testing.

### Error: "duplicate key value violates unique constraint"

**Solution:** Tables/policies already exist. This is OK - the migration uses `IF NOT EXISTS`.

### Tables exist but RLS not working

**Solution:** Check if RLS is enabled:
```sql
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
```

### Can't see data after creating

**Solution:** 
1. Check `org_id` is set correctly
2. Verify user has membership in organization
3. Check RLS policies are correct

## Verification Checklist

- [ ] Migration executed successfully
- [ ] All tables exist (`clients`, `services`, `invoices`, `quotes`, etc.)
- [ ] Tables have correct columns
- [ ] RLS is enabled on all tables
- [ ] RLS policies exist and are correct
- [ ] Indexes are created
- [ ] Triggers are created (for `updated_at`)
- [ ] Can create clients through app
- [ ] Can create services through app
- [ ] Organization isolation works (users only see their org's data)
- [ ] EntityManager correctly filters by `org_id`

## Next Steps

After verification:

1. **Test Invoice Creation**
   - Create an invoice with a client and services
   - Verify invoice_items are created correctly

2. **Test Quote Creation**
   - Create a quote with a client and services
   - Verify quote_items are created correctly

3. **Test Data Relationships**
   - Create invoice → verify client relationship
   - Create invoice items → verify service relationships

4. **Monitor Performance**
   - Check query performance with indexes
   - Verify `org_id` filtering is fast

## Support

If you encounter issues:

1. Check Supabase logs in dashboard
2. Run verification script: `node scripts/verify-database-setup.js`
3. Check RLS policies: Run queries from `scripts/test-rls-policies.sql`
4. Verify EntityManager code matches expected behavior
