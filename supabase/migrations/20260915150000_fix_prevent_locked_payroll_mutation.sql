-- Recalculate updates pay_runs / pay_run_items. Those tables have no `locked`
-- column. The shared lock trigger used `IF TG_TABLE_NAME = 'payslips' AND OLD.locked`
-- as one expression, so Postgres looked up OLD.locked on every table and failed
-- with: record "old" has no field "locked".
-- Additive: replace the function only. Existing triggers stay attached.

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
         OR NEW.calculation_breakdown IS DISTINCT FROM OLD.calculation_breakdown THEN
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
