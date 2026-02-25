-- Test RLS Policies
-- Run these queries in Supabase SQL editor to verify RLS is working correctly

-- ============================================
-- 1. Verify RLS is enabled on all tables
-- ============================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services', 'invoices', 'quotes', 'payments', 'organizations', 'memberships', 'profiles')
ORDER BY tablename;

-- Expected: All tables should have rowsecurity = true

-- ============================================
-- 2. Check existing policies
-- ============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services', 'invoices', 'quotes')
ORDER BY tablename, policyname;

-- Expected: Should see policies like:
-- - "admin full access clients"
-- - "org members select"
-- - "org members write"

-- ============================================
-- 3. Test as authenticated user (requires auth context)
-- ============================================
-- Note: These queries need to be run with a user session
-- In Supabase dashboard, use the "Run as user" feature or test via API

-- Test querying clients (should only return user's org clients)
SELECT 
  c.*,
  o.name as org_name
FROM public.clients c
JOIN public.organizations o ON o.id = c.org_id
JOIN public.memberships m ON m.org_id = o.id
WHERE m.user_id = auth.uid()
ORDER BY c.created_at DESC
LIMIT 10;

-- Test querying services (should only return user's org services)
SELECT 
  s.*,
  o.name as org_name
FROM public.services s
JOIN public.organizations o ON o.id = s.org_id
JOIN public.memberships m ON m.org_id = o.id
WHERE m.user_id = auth.uid()
ORDER BY s.created_at DESC
LIMIT 10;

-- ============================================
-- 4. Verify indexes exist
-- ============================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'services', 'invoices', 'quotes')
ORDER BY tablename, indexname;

-- Expected: Should see indexes like:
-- - idx_clients_org_id
-- - idx_clients_name
-- - idx_services_org_id
-- - idx_services_item_type
-- etc.

-- ============================================
-- 5. Check table structure
-- ============================================
-- Clients table columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
ORDER BY ordinal_position;

-- Services table columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'services'
ORDER BY ordinal_position;

-- ============================================
-- 6. Test triggers
-- ============================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('clients', 'services', 'profiles')
ORDER BY event_object_table, trigger_name;

-- Expected: Should see triggers like:
-- - update_clients_updated_at
-- - update_services_updated_at
-- - update_profiles_updated_at
