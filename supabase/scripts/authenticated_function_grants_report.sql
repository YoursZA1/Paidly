-- READ-ONLY. Run in the Supabase SQL editor. Changes nothing.
--
-- Symptom: signed-in users get HTTP 403 on /rest/v1/organizations, memberships, invoices, and on
-- rpc/get_my_onboarding_context, rpc/get_my_tenant_context. PostgREST returns 403 (not 401) for
-- SQLSTATE 42501 on an authenticated request: the role `authenticated` lacks EXECUTE on a function.
-- RLS policies run their helper functions as the caller, so one missing grant fails every query on
-- the table before any row is checked (anon sees: "permission denied for function
-- is_company_admin_for_org").
--
-- Fix: supabase/migrations/20260925120000_restore_authenticated_rls_function_grants.sql

-- 1. Functions called by live RLS policies, and whether each API role may execute them.
WITH policy_text AS (
  SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
  FROM pg_policies
  WHERE schemaname = 'public'
),
used AS (
  SELECT DISTINCT p.oid, p.proname, p.prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  JOIN policy_text t ON t.expr ~ ('\m' || p.proname || '\s*\(')
)
SELECT
  u.oid::regprocedure                                   AS function,
  u.prosecdef                                           AS security_definer,
  has_function_privilege('authenticated', u.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', u.oid, 'EXECUTE')          AS anon_can_execute,
  (SELECT count(*) FROM policy_text t WHERE t.expr ~ ('\m' || u.proname || '\s*\(')) AS policies_using_it
FROM used u
ORDER BY authenticated_can_execute, u.oid::regprocedure::text;

-- 2. RPCs the browser calls.
SELECT
  p.oid::regprocedure                                   AS rpc,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN (
  'accept_company_invite_token', 'adjust_inventory_stock', 'convert_quote_to_invoice',
  'get_my_onboarding_context', 'get_my_tenant_context', 'next_document_number',
  'receive_purchase_order_item'
)
ORDER BY authenticated_can_execute, p.oid::regprocedure::text;

-- 3. Table privileges for the tables in the 403s (expect SELECT = true for authenticated).
SELECT
  t.table_name,
  has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT') AS authenticated_select,
  has_table_privilege('anon', format('public.%I', t.table_name), 'SELECT')          AS anon_select
FROM (VALUES ('organizations'), ('memberships'), ('invoices')) AS t (table_name);
