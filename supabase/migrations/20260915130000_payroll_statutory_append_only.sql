-- Org statutory rates are versioned rows. Unique windows prevent silent duplicates.
-- Does not rewrite historical value jsonb.

CREATE UNIQUE INDEX IF NOT EXISTS payroll_statutory_rules_org_code_from_uidx
  ON public.payroll_statutory_rules (org_id, code, effective_from)
  WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_statutory_rules_platform_code_from_uidx
  ON public.payroll_statutory_rules (code, effective_from)
  WHERE org_id IS NULL;

COMMENT ON INDEX public.payroll_statutory_rules_org_code_from_uidx IS
  'Append-only org statutory versions: one row per org/code/effective_from.';

CREATE OR REPLACE FUNCTION public.payroll_statutory_rules_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.calculation_type IS DISTINCT FROM OLD.calculation_type
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'statutory rules are append-only; insert a new version'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_statutory_rules_append_only ON public.payroll_statutory_rules;
CREATE TRIGGER payroll_statutory_rules_append_only
  BEFORE UPDATE ON public.payroll_statutory_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.payroll_statutory_rules_append_only();

COMMENT ON FUNCTION public.payroll_statutory_rules_append_only() IS
  'Blocks in-place value/code/effective_from rewrites. Closing effective_to is allowed.';
