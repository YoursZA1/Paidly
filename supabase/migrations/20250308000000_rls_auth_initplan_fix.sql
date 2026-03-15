-- RLS Auth InitPlan fix (Supabase linter: auth_rls_initplan)
-- Ensures auth.uid() / auth.jwt() are evaluated once per query instead of per row.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- 1. Fix is_admin() so auth.jwt() is evaluated once (used by admin policies)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(((SELECT auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

-- 2. Policy expressions: use (select auth.uid()) instead of auth.uid()
--    Applied in schema.postgres.sql for new deploys. For existing DBs, re-run the
--    policy section of schema.postgres.sql (DROP POLICY ... CREATE POLICY ...) or
--    run `supabase db push` / re-apply migrations that define policies with the fix.
