-- Payroll → bank reconciliation, employee payslip snapshot, and hardened
-- immutability for finalised payroll. Additive only; extends existing tables.
--
-- 1. pay_runs gains bank settlement columns (expected = locked net_total,
--    actual = bank salary payment, optionally linked to Cash Flow expenses
--    imported from a bank statement). No separate banking table.
-- 2. payslips.employee_snapshot freezes employee payroll identity (tax ref,
--    masked bank, start date) at issue time — profile edits affect future slips only.
-- 3. prevent_locked_payroll_mutation now also locks PAYE/UIF (statutory lines),
--    deductions and identity on finalised items, and blocks deleting finalised
--    payroll outside of FK cascades (org deletion still works).

ALTER TABLE public.pay_runs
  ADD COLUMN IF NOT EXISTS bank_payment_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS bank_payment_date date,
  ADD COLUMN IF NOT EXISTS bank_payment_reference text,
  ADD COLUMN IF NOT EXISTS bank_payment_expense_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS bank_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_reconciled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pay_runs.bank_payment_amount IS
  'Actual salary amount that left the bank for this run. Compared to net_total (expected) for reconciliation.';
COMMENT ON COLUMN public.pay_runs.bank_payment_expense_ids IS
  'Cash Flow expenses (e.g. bank-statement salary lines) matched to this run. Excluded from dashboard expenses to avoid double counting payroll.';

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS employee_snapshot jsonb;

COMMENT ON COLUMN public.payslips.employee_snapshot IS
  'Frozen employee payroll identity at issue time (tax number, masked ID/bank, start date). Live profile updates future payslips only.';

CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payslip_locked boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- FK cascades (org/user removal) run nested inside RI triggers: allow them.
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    IF TG_TABLE_NAME = 'pay_runs' AND OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Finalized pay runs cannot be deleted. Create an adjustment run.';
    END IF;
    IF TG_TABLE_NAME = 'pay_run_items' AND EXISTS (
      SELECT 1 FROM public.pay_runs r
      WHERE r.id = OLD.pay_run_id AND r.finalized_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Items on a finalized pay run cannot be deleted';
    END IF;
    IF TG_TABLE_NAME = 'payslips' AND COALESCE((to_jsonb(OLD)->>'locked')::boolean, false) THEN
      RAISE EXCEPTION 'Locked payslips cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'pay_runs' THEN
    IF OLD.status IN ('paid') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'Paid pay runs cannot be modified';
    END IF;
    IF OLD.finalized_at IS NOT NULL THEN
      IF NEW.period_start IS DISTINCT FROM OLD.period_start
         OR NEW.period_end IS DISTINCT FROM OLD.period_end
         OR NEW.gross_total IS DISTINCT FROM OLD.gross_total
         OR NEW.deductions_total IS DISTINCT FROM OLD.deductions_total
         OR NEW.net_total IS DISTINCT FROM OLD.net_total
         OR NEW.employee_count IS DISTINCT FROM OLD.employee_count
         OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN
        RAISE EXCEPTION 'Finalized pay runs cannot be rewritten. Create an adjustment run.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'payslips' THEN
    payslip_locked := COALESCE((to_jsonb(OLD)->>'locked')::boolean, false);
    IF payslip_locked THEN
      IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
         OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
         OR NEW.basic_salary IS DISTINCT FROM OLD.basic_salary
         OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
         OR NEW.tax_deduction IS DISTINCT FROM OLD.tax_deduction
         OR NEW.uif_deduction IS DISTINCT FROM OLD.uif_deduction
         OR NEW.pay_period_start IS DISTINCT FROM OLD.pay_period_start
         OR NEW.pay_period_end IS DISTINCT FROM OLD.pay_period_end
         OR NEW.calculation_breakdown IS DISTINCT FROM OLD.calculation_breakdown
         OR NEW.employer_snapshot IS DISTINCT FROM OLD.employer_snapshot
         OR (to_jsonb(NEW)->'employee_snapshot') IS DISTINCT FROM (to_jsonb(OLD)->'employee_snapshot') THEN
        RAISE EXCEPTION 'Locked payslips cannot have their calculated amounts changed';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'pay_run_items' THEN
    IF EXISTS (
      SELECT 1 FROM public.pay_runs r
      WHERE r.id = OLD.pay_run_id AND r.finalized_at IS NOT NULL
    ) THEN
      IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
         OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
         OR NEW.base_pay IS DISTINCT FROM OLD.base_pay
         OR NEW.earnings IS DISTINCT FROM OLD.earnings
         OR NEW.taxable_income IS DISTINCT FROM OLD.taxable_income
         OR NEW.statutory_deductions IS DISTINCT FROM OLD.statutory_deductions
         OR NEW.other_deductions IS DISTINCT FROM OLD.other_deductions
         OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
         OR NEW.employee_name IS DISTINCT FROM OLD.employee_name
         OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
         OR NEW.pay_run_id IS DISTINCT FROM OLD.pay_run_id
         OR NEW.calculation IS DISTINCT FROM OLD.calculation THEN
        RAISE EXCEPTION 'Items on a finalized pay run cannot be rewritten';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pay_runs_lock_delete ON public.pay_runs;
CREATE TRIGGER pay_runs_lock_delete
  BEFORE DELETE ON public.pay_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

DROP TRIGGER IF EXISTS payslips_lock_delete ON public.payslips;
CREATE TRIGGER payslips_lock_delete
  BEFORE DELETE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

DROP TRIGGER IF EXISTS pay_run_items_lock_delete ON public.pay_run_items;
CREATE TRIGGER pay_run_items_lock_delete
  BEFORE DELETE ON public.pay_run_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

CREATE INDEX IF NOT EXISTS idx_pay_runs_org_finalized
  ON public.pay_runs (org_id, period_start DESC)
  WHERE finalized_at IS NOT NULL;
