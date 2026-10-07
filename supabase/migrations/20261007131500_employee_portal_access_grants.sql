-- 24-hour employee-details links. The raw token is emailed once and only the hash is stored.
-- Not a Paidly password and not a till session. Service role only.

CREATE TABLE IF NOT EXISTS public.employee_portal_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_employee_portal_access_grants_email_recent
  ON public.employee_portal_access_grants (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_portal_access_grants_open
  ON public.employee_portal_access_grants (token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.employee_portal_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_portal_access_grants FROM anon, authenticated;
GRANT ALL ON public.employee_portal_access_grants TO service_role;

COMMENT ON TABLE public.employee_portal_access_grants IS
  'Hashed 24-hour links that open one employee''s own record, payslips, leave, and documents. Not a permanent login.';
