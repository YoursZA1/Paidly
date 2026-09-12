-- Additive backfill, then CHECK membership_id on new/existing payslips.
-- VALIDATE is skipped with a NOTICE when residual nulls remain.
-- Does not rewrite printed payslips.employee_id numbers.

DO $$
BEGIN
  IF to_regclass('public.payslips') IS NULL THEN
    RAISE EXCEPTION 'public.payslips does not exist.';
  END IF;
END $$;

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

UPDATE public.payslips p
SET membership_id = m.id
FROM public.memberships m
WHERE p.membership_id IS NULL
  AND p.org_id = m.org_id
  AND p.employee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND m.id = p.employee_id::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payslips_membership_id_required'
  ) THEN
    ALTER TABLE public.payslips
      ADD CONSTRAINT payslips_membership_id_required
      CHECK (membership_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payslips WHERE membership_id IS NULL) THEN
    RAISE NOTICE 'payslips.membership_id still has nulls; CHECK left NOT VALID';
  ELSE
    ALTER TABLE public.payslips VALIDATE CONSTRAINT payslips_membership_id_required;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'payslips_membership_id_required left NOT VALID: %', SQLERRM;
END $$;
