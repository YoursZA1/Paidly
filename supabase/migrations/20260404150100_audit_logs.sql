-- Persisted audit trail for Admin V2 → Audit Log (admin + management).
-- Replaces reliance on localStorage-only data and avoids permanently skipping Supabase when the table was once missing.
--
-- Do **not** replace this with a minimal table (e.g. only id, action, user_id): the client inserts
-- category, action, description, before, after, actor_name, actor_email, actor_role, target_label
-- (see src/lib/auditLogger.js). This file is the canonical schema + RLS.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'settings',
  action text NOT NULL DEFAULT '',
  description text,
  before jsonb,
  after jsonb,
  actor_name text,
  actor_email text,
  actor_role text,
  target_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Requires public.profile_role_value() from affiliate_internal_team_access migration.
CREATE OR REPLACE FUNCTION public.is_audit_log_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.profile_role_value(p) IN ('admin', 'management')
  );
$$;

DROP POLICY IF EXISTS "audit_logs_select_team" ON public.audit_logs;
CREATE POLICY "audit_logs_select_team"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_audit_log_viewer());

DROP POLICY IF EXISTS "audit_logs_insert_team" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_team"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_audit_log_viewer());

COMMENT ON TABLE public.audit_logs IS 'Internal team audit trail; written from app logAction and readable on /admin-v2/audit-log.';
