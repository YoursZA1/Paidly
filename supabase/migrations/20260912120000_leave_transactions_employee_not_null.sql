-- Tighten leave_transactions.employee_id without deleting production rows.
-- SET NOT NULL is skipped with a NOTICE when residual nulls remain.

DO $$
BEGIN
  IF to_regclass('public.leave_transactions') IS NULL THEN
    RAISE EXCEPTION 'public.leave_transactions does not exist.';
  END IF;
END $$;

UPDATE public.leave_transactions t
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE t.payroll_profile_id = p.id
  AND t.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leave_transactions WHERE employee_id IS NULL) THEN
    ALTER TABLE public.leave_transactions ALTER COLUMN employee_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'leave_transactions.employee_id still has nulls; NOT NULL skipped';
  END IF;
END $$;
