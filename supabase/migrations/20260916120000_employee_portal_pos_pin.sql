-- Employee portal revoke flag + membership-scoped POS PIN + session membership stamps.
-- Additive only. Does not recreate employees or reset memberships.

DO $$
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
END $$;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS portal_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS pos_pin_hash text,
  ADD COLUMN IF NOT EXISTS pos_pin_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pos_pin_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_pin_locked_until timestamptz;

COMMENT ON COLUMN public.memberships.portal_revoked_at IS
  'When set, employee portal self-service is blocked. Membership, payroll, leave, and payslips remain.';
COMMENT ON COLUMN public.memberships.pos_pin_hash IS
  'Hashed POS PIN for Auth-backed staff with pos_access. Never plaintext. Distinct from Paidly Auth password.';
COMMENT ON COLUMN public.memberships.pos_pin_failed_attempts IS
  'Consecutive failed POS PIN verifications. Reset on success.';
COMMENT ON COLUMN public.memberships.pos_pin_locked_until IS
  'Soft lockout after too many failed POS PIN attempts.';

DO $$
BEGIN
  IF to_regclass('public.pos_register_sessions') IS NOT NULL THEN
    ALTER TABLE public.pos_register_sessions
      ADD COLUMN IF NOT EXISTS opened_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS closed_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

    COMMENT ON COLUMN public.pos_register_sessions.opened_by_membership_id IS
      'Canonical employee (memberships.id) who opened the shift. opened_by remains auth.users id.';
    COMMENT ON COLUMN public.pos_register_sessions.closed_by_membership_id IS
      'Canonical employee (memberships.id) who closed the shift. closed_by remains auth.users id.';
  END IF;
END $$;
