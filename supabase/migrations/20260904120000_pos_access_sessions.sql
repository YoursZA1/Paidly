-- POS employee access pass: scoped till session without a Paidly Auth account.
-- Invite tokens are consumed into this table. The browser never talks to it (service_role only).

DO $$
BEGIN
  IF to_regclass('public.company_invites') IS NULL THEN
    RAISE EXCEPTION 'company_invites missing — apply invite migrations before POS access sessions';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pos_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.company_invites(id) ON DELETE SET NULL,
  register_id uuid REFERENCES public.pos_registers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_email text,
  employee_name text,
  role text NOT NULL DEFAULT 'employee',
  job_function text NOT NULL DEFAULT 'pos',
  token_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_access_sessions_token_hash_uidx
  ON public.pos_access_sessions (token_hash);

CREATE INDEX IF NOT EXISTS pos_access_sessions_org_idx
  ON public.pos_access_sessions (org_id, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.pos_access_sessions IS
  'Hashed POS access-pass sessions issued from a POS invite. Not a Paidly Auth session.';

ALTER TABLE public.pos_access_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pos_access_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.pos_access_sessions FROM anon;
REVOKE ALL ON TABLE public.pos_access_sessions FROM authenticated;
GRANT ALL ON TABLE public.pos_access_sessions TO service_role;
