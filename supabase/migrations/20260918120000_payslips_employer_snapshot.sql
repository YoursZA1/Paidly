-- Snapshot employer chrome onto issued payslips so profile updates do not rewrite history.
-- Employer PAYE/UIF/SDL refs live on organizations.payroll_settings (jsonb).

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS employer_snapshot jsonb;

COMMENT ON COLUMN public.payslips.employer_snapshot IS
  'Frozen employer details at issue time (name, registration, address, contact, PAYE/UIF/SDL refs). Live org profile updates future payslips only.';

-- Locked payslips must not rewrite employer snapshot (same class as amount lock).
CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payslip_locked boolean;
BEGIN
  IF TG_TABLE_NAME = 'pay_runs' THEN
    IF OLD.status IN ('paid') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'Paid pay runs cannot be modified';
    END IF;
    IF OLD.finalized_at IS NOT NULL THEN
      IF NEW.period_start IS DISTINCT FROM OLD.period_start
         OR NEW.period_end IS DISTINCT FROM OLD.period_end
         OR NEW.gross_total IS DISTINCT FROM OLD.gross_total
         OR NEW.net_total IS DISTINCT FROM OLD.net_total THEN
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
         OR NEW.calculation_breakdown IS DISTINCT FROM OLD.calculation_breakdown
         OR NEW.employer_snapshot IS DISTINCT FROM OLD.employer_snapshot THEN
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
         OR NEW.calculation IS DISTINCT FROM OLD.calculation THEN
        RAISE EXCEPTION 'Items on a finalized pay run cannot be rewritten';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
