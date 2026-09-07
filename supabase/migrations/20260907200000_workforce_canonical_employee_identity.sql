-- Canonical employee identity is public.memberships.id (not a parallel employees table).
-- Additive only. Does not delete rows. Does not weaken UUID columns to text.
-- payslips.employee_id remains the printed employee number (text). UUID link is membership_id.

DO $$
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
  IF to_regclass('public.payroll_profiles') IS NULL THEN
    RAISE EXCEPTION 'public.payroll_profiles does not exist.';
  END IF;
END $$;

-- ── Leave ledger: employee_id → memberships.id ───────────────────────────────

ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.memberships(id) ON DELETE CASCADE;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.memberships(id) ON DELETE CASCADE;

ALTER TABLE public.leave_transactions
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.leave_balances b
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE b.payroll_profile_id = p.id
  AND b.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

UPDATE public.leave_requests r
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE r.payroll_profile_id = p.id
  AND r.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

UPDATE public.leave_transactions t
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE t.payroll_profile_id = p.id
  AND t.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee
  ON public.leave_balances (org_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON public.leave_requests (org_id, employee_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_leave_transactions_employee
  ON public.leave_transactions (employee_id, created_at DESC);

-- ── Payslips: UUID employee link (printed number stays on employee_id) ───────

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.payslips p
SET membership_id = pp.membership_id
FROM public.payroll_profiles pp
WHERE p.payroll_profile_id = pp.id
  AND p.membership_id IS NULL
  AND pp.membership_id IS NOT NULL;

UPDATE public.payslips p
SET membership_id = m.id
FROM public.memberships m
WHERE p.membership_id IS NULL
  AND p.org_id = m.org_id
  AND m.employee_number IS NOT NULL
  AND length(trim(m.employee_number)) > 0
  AND trim(p.employee_id) = trim(m.employee_number);

-- If a historical row stored a membership UUID in the text employee_id field, copy it.
UPDATE public.payslips p
SET membership_id = m.id
FROM public.memberships m
WHERE p.membership_id IS NULL
  AND p.org_id = m.org_id
  AND p.employee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND m.id = p.employee_id::uuid;

CREATE INDEX IF NOT EXISTS idx_payslips_membership
  ON public.payslips (org_id, membership_id)
  WHERE membership_id IS NOT NULL;

-- Backfill employee_user_id from the membership when the payslip is linked.
UPDATE public.payslips p
SET employee_user_id = m.user_id
FROM public.memberships m
WHERE p.membership_id = m.id
  AND p.employee_user_id IS NULL
  AND m.user_id IS NOT NULL;

-- ── Pay-run item snapshots (historical safety; current config stays on profile)

ALTER TABLE public.pay_run_items
  ADD COLUMN IF NOT EXISTS base_salary_snapshot numeric(14,2),
  ADD COLUMN IF NOT EXISTS unpaid_leave_days numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_amount numeric(14,2) NOT NULL DEFAULT 0;

-- ── Attendance profile (derived 1:1, not a second employee) ──────────────────

CREATE TABLE IF NOT EXISTS public.attendance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  payroll_profile_id uuid REFERENCES public.payroll_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_profiles_org
  ON public.attendance_profiles (org_id, employee_id);

COMMENT ON TABLE public.attendance_profiles IS
  'Derived attendance stub per employee (memberships.id). Provisioned with the workforce record. Not a second identity table.';

INSERT INTO public.attendance_profiles (org_id, employee_id, payroll_profile_id, status)
SELECT p.org_id, p.membership_id, p.id, 'active'
FROM public.payroll_profiles p
WHERE p.membership_id IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;

ALTER TABLE public.attendance_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_profiles FROM anon, authenticated;
GRANT SELECT ON public.attendance_profiles TO authenticated;

DROP POLICY IF EXISTS "attendance_profiles_select" ON public.attendance_profiles;
CREATE POLICY "attendance_profiles_select" ON public.attendance_profiles
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = attendance_profiles.employee_id
        AND m.user_id = auth.uid()
        AND NOT public.is_pos_only_staff()
    )
  );

-- ── Payslip self-service via membership_id ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_payslip_row(p public.payslips)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = p.org_id
      AND m.user_id = auth.uid()
  )
  AND (
    public.is_admin()
    OR public.is_company_admin_for_org(p.org_id)
    OR public.is_company_manager_for_org(p.org_id)
    OR p.employee_user_id = auth.uid()
    OR p.user_id = auth.uid()
    OR p.created_by_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships own
      WHERE own.id = p.membership_id
        AND own.user_id = auth.uid()
        AND NOT public.is_pos_only_staff()
    )
    OR (
      p.employee_email IS NOT NULL
      AND lower(trim(p.employee_email)) = lower(trim(coalesce(
        (SELECT pr.email FROM public.profiles pr WHERE pr.id = auth.uid()),
        ''
      )))
    )
  );
$$;

COMMENT ON COLUMN public.leave_balances.employee_id IS
  'Canonical employee UUID (memberships.id). payroll_profile_id remains the ledger FK.';
COMMENT ON COLUMN public.leave_requests.employee_id IS
  'Canonical employee UUID (memberships.id).';
COMMENT ON COLUMN public.payslips.membership_id IS
  'Canonical employee UUID (memberships.id). payslips.employee_id is the printed employee number.';
GRANT EXECUTE ON FUNCTION public.can_read_payslip_row(public.payslips) TO authenticated;
