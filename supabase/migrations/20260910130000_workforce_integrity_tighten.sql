-- Tighten workforce identity without deleting production rows.
-- SET NOT NULL is skipped with a NOTICE when residual nulls remain.

DO $$
BEGIN
  IF to_regclass('public.leave_requests') IS NULL THEN
    RAISE EXCEPTION 'public.leave_requests does not exist.';
  END IF;
END $$;

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

UPDATE public.pay_run_items i
SET membership_id = p.membership_id
FROM public.payroll_profiles p
WHERE i.payroll_profile_id = p.id
  AND i.membership_id IS NULL
  AND p.membership_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leave_requests WHERE employee_id IS NULL) THEN
    ALTER TABLE public.leave_requests ALTER COLUMN employee_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'leave_requests.employee_id still has nulls; NOT NULL skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leave_balances WHERE employee_id IS NULL) THEN
    ALTER TABLE public.leave_balances ALTER COLUMN employee_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'leave_balances.employee_id still has nulls; NOT NULL skipped';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_employee_type_year_uidx
  ON public.leave_balances (employee_id, leave_type_id, leave_year)
  WHERE employee_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pay_run_items WHERE membership_id IS NULL
  ) THEN
    ALTER TABLE public.pay_run_items ALTER COLUMN membership_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'pay_run_items.membership_id still has nulls; NOT NULL skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payslips_payrun_requires_membership'
  ) THEN
    ALTER TABLE public.payslips
      ADD CONSTRAINT payslips_payrun_requires_membership
      CHECK (pay_run_item_id IS NULL OR membership_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.payslips VALIDATE CONSTRAINT payslips_payrun_requires_membership;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'payslips_payrun_requires_membership left NOT VALID: %', SQLERRM;
END $$;

ALTER TABLE public.pay_runs
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.documents') IS NOT NULL THEN
    ALTER TABLE public.documents
      ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;
    UPDATE public.documents d
    SET membership_id = m.id
    FROM public.memberships m
    WHERE d.membership_id IS NULL
      AND d.org_id = m.org_id
      AND m.user_id IS NOT NULL
      AND (d.user_id = m.user_id OR d.assigned_user_id = m.user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_membership
      ON public.documents (org_id, membership_id)
      WHERE membership_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_audit_employee
  ON public.workforce_audit_logs (org_id, employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memberships_manager
  ON public.memberships (org_id, manager_membership_id)
  WHERE manager_membership_id IS NOT NULL;
