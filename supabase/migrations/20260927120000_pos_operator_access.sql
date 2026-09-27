-- POS operator access codes, operator attribution, table assignment, custom provider requests.
--
-- Builds on existing POS access (pos_access_sessions = scoped till session, not Paidly Auth) and the
-- canonical employee identity (memberships.id). Additive only — no data is removed or weakened.
--
--   memberships (employee) ─┬─ pos_access_codes (one active 6-digit code; keyed-HMAC, never plaintext)
--                           └─ pos_access_sessions (+membership_id, +credential_id) ← issued on code entry
--   pos_tables.assigned_membership_id  (nullable; many tables per operator — no uniqueness)
--   pos_tabs.server_membership_id + register_session_id  (operator + shift attribution)
--   pos_custom_providers  (a business's request for a provider Paidly has no adapter for; never "connected")
--
-- Codes, failures and sessions are service_role only: the browser never reads a hash.
-- Idempotent.

DO $$
BEGIN
  IF to_regclass('public.pos_access_sessions') IS NULL THEN
    RAISE EXCEPTION 'pos_access_sessions missing — apply 20260904120000_pos_access_sessions.sql first';
  END IF;
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'memberships missing';
  END IF;
END $$;

-- ── POS access switch per employee (separate from disabling the whole membership) ─────
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS pos_access_disabled_at timestamptz;
COMMENT ON COLUMN public.memberships.pos_access_disabled_at IS
  'Set when a manager disables POS access for this employee. Codes and till sessions stop working; the employee record is untouched.';

-- ── Access codes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.pos_registers(id) ON DELETE SET NULL,
  code_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
-- One active code per employee; an active code value is unique inside a business.
CREATE UNIQUE INDEX IF NOT EXISTS pos_access_codes_one_active_per_member
  ON public.pos_access_codes (membership_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pos_access_codes_active_hash_per_org
  ON public.pos_access_codes (org_id, code_hash) WHERE revoked_at IS NULL;
COMMENT ON TABLE public.pos_access_codes IS
  'POS operator access codes. code_hash = HMAC-SHA256(server secret, org_id:code). The plaintext is shown once at generation and never stored.';

-- Failed code attempts (rate limiting per till and per client).
CREATE TABLE IF NOT EXISTS public.pos_access_code_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.pos_registers(id) ON DELETE CASCADE,
  client_hash text,
  failed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_access_code_failures_register_idx ON public.pos_access_code_failures (register_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS pos_access_code_failures_client_idx ON public.pos_access_code_failures (client_hash, failed_at DESC);

-- ── Till sessions know the operator and the credential that opened them ────────────
ALTER TABLE public.pos_access_sessions
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS credential_id uuid REFERENCES public.pos_access_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pos_access_sessions_credential_idx ON public.pos_access_sessions (credential_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS pos_access_sessions_membership_idx ON public.pos_access_sessions (membership_id) WHERE revoked_at IS NULL;

-- ── Restaurant: table assignment and operator/shift attribution ────────────────────
DO $$
BEGIN
  IF to_regclass('public.pos_tables') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pos_tables ADD COLUMN IF NOT EXISTS assigned_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_tables_assigned ON public.pos_tables (org_id, assigned_membership_id) WHERE assigned_membership_id IS NOT NULL';
    EXECUTE $c$COMMENT ON COLUMN public.pos_tables.assigned_membership_id IS
      'Server/operator responsible for this table (optional). Many tables may share one operator.'$c$;
  END IF;
  IF to_regclass('public.pos_tabs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pos_tabs ADD COLUMN IF NOT EXISTS server_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL';
    IF to_regclass('public.pos_register_sessions') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.pos_tabs ADD COLUMN IF NOT EXISTS register_session_id uuid REFERENCES public.pos_register_sessions(id) ON DELETE SET NULL';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_tabs_server ON public.pos_tabs (org_id, server_membership_id) WHERE server_membership_id IS NOT NULL';
  END IF;
END $$;

-- ── Custom provider requests (no adapter → never usable at checkout) ────────────────
CREATE TABLE IF NOT EXISTS public.pos_custom_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_name text NOT NULL CHECK (char_length(btrim(provider_name)) > 0),
  display_name text,
  method text NOT NULL DEFAULT 'other' CHECK (method IN ('card_terminal', 'online_eft', 'qr', 'wallet', 'other')),
  website text,
  contact text,
  notes text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_custom_providers_org_idx ON public.pos_custom_providers (org_id, status);
COMMENT ON TABLE public.pos_custom_providers IS
  'A provider the business uses but Paidly has no adapter for. Stored as a request only — no credentials, never shown as connected, never selectable at checkout.';

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pos_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_access_code_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_access_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_access_code_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pos_access_codes TO service_role;
GRANT ALL ON TABLE public.pos_access_code_failures TO service_role;

ALTER TABLE public.pos_custom_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_custom_providers_org_select ON public.pos_custom_providers;
CREATE POLICY pos_custom_providers_org_select ON public.pos_custom_providers
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
GRANT ALL ON TABLE public.pos_custom_providers TO service_role;
GRANT SELECT ON TABLE public.pos_custom_providers TO authenticated;
