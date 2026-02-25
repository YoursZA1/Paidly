-- ============================================
-- DIAGNOSTIC QUERIES FOR CLIENT SAVE ERROR
-- ============================================
-- Run these queries to diagnose the "Failed to save client" error

-- 1. Check if user has membership and organization
SELECT 
  u.id as user_id,
  u.email,
  m.org_id,
  o.name as org_name,
  m.role as membership_role
FROM auth.users u
LEFT JOIN public.memberships m ON m.user_id = u.id
LEFT JOIN public.organizations o ON o.id = m.org_id
WHERE u.id = auth.uid();

-- Expected: Should return 1 row with org_id and org_name
-- If no row or NULL org_id: User needs membership (see fix below)

-- 2. Check if clients table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'clients'
) as table_exists;

-- Expected: Should return true

-- 3. Check clients table columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
ORDER BY ordinal_position;

-- Expected: Should see columns like:
-- id, org_id, name, email, phone, address, contact_person, etc.

-- 4. Check RLS policies on clients table
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clients'
ORDER BY policyname;

-- Expected: Should see policies like:
-- "org members select"
-- "org members write"

-- 5. Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'clients';

-- Expected: Should show rls_enabled = true

-- 6. Test insert (replace YOUR_ORG_ID with actual org_id from query 1)
-- Uncomment and run if you want to test:
/*
INSERT INTO public.clients (org_id, name, email)
VALUES (
  'YOUR_ORG_ID_HERE',
  'Test Client',
  'test@example.com'
)
RETURNING *;
*/

-- ============================================
-- FIXES
-- ============================================

-- Fix 1: Create membership if missing
-- Replace USER_ID with actual user ID from query 1
/*
INSERT INTO public.memberships (org_id, user_id, role)
SELECT o.id, 'USER_ID_HERE', 'owner'
FROM public.organizations o
WHERE o.owner_id = 'USER_ID_HERE'
LIMIT 1
ON CONFLICT (org_id, user_id) DO NOTHING;
*/

-- Fix 2: Enable RLS if disabled
/*
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
*/

-- Fix 3: Create RLS policies if missing
-- (These should already exist from migration, but run if missing)
/*
CREATE POLICY "org members select" ON public.clients
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "org members write" ON public.clients
  FOR INSERT, UPDATE, DELETE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
  ));
*/
