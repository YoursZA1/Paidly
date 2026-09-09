-- Leave approval tokens (hash-only, single-use) and workforce notification prefs.
-- Additive only. Service-role writes; no client policies on tokens.

DO $$
BEGIN
  IF to_regclass('public.leave_requests') IS NULL THEN
    RAISE EXCEPTION 'public.leave_requests does not exist.';
  END IF;
END $$;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approver_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_method text,
  ADD COLUMN IF NOT EXISTS manager_comment text,
  ADD COLUMN IF NOT EXISTS decided_email text;

CREATE TABLE IF NOT EXISTS public.leave_approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  leave_request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  approver_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_ip text,
  decision text CHECK (decision IS NULL OR decision IN ('approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_approval_tokens_request_open
  ON public.leave_approval_tokens (leave_request_id)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_approval_tokens_expiry
  ON public.leave_approval_tokens (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.leave_approval_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leave_approval_tokens FROM anon, authenticated;
GRANT ALL ON public.leave_approval_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.workforce_notification_prefs (
  employee_id uuid PRIMARY KEY REFERENCES public.memberships(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channels jsonb NOT NULL DEFAULT '{"in_app":true,"email":true}'::jsonb,
  payslip_email boolean NOT NULL DEFAULT true,
  leave_decision_email boolean NOT NULL DEFAULT true,
  leave_request_email boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workforce_notification_prefs (employee_id, org_id)
SELECT m.id, m.org_id
FROM public.memberships m
ON CONFLICT (employee_id) DO NOTHING;

ALTER TABLE public.workforce_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workforce_notification_prefs_select ON public.workforce_notification_prefs;
CREATE POLICY workforce_notification_prefs_select
  ON public.workforce_notification_prefs
  FOR SELECT
  USING (
    employee_id IN (SELECT id FROM public.memberships WHERE user_id = auth.uid())
    OR public.is_company_admin_for_org(org_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.workforce_notification_prefs FROM anon, authenticated;
GRANT SELECT ON public.workforce_notification_prefs TO authenticated;
GRANT ALL ON public.workforce_notification_prefs TO service_role;
