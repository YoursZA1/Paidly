-- Payroll: SARS tax-year-aware statutory rules, YTD on payslips, pay-type units (2026-09-25).
--
-- Why: the only platform PAYE rule was seeded effective 2000-01-01 with no end date and 2025/26
-- values (primary rebate R17 235). Every period — including September 2026 — used it, so a R12 000
-- monthly salary got PAYE R723.75 instead of R675.00 under the 2026/27 tables.
--
-- Values below are SARS publications (sars.gov.za → Rates of Tax for Individuals, Medical Tax
-- Credit Rates, checked 2026-09-25). Payroll selects rows by the PAYMENT date; the engine
-- (shared/payroll/calculatePayroll.js) carries no rates.
--
-- 1. Platform PAYE (org_id NULL) — append-only versions:
--      2000-01-01 row closed at 2025-02-28 (its values stay for history)
--      2025/26: 2025-03-01 → 2026-02-28   rebates 17 235 / 9 444 / 3 145   MTC 364 / 364 / 246
--      2026/27: 2026-03-01 → 2027-02-28   rebates 17 820 / 9 765 / 3 249   MTC 376 / 376 / 254
--    Brackets are stored as { above, rate, base }: tax = base + rate × (income − above).
--    Retirement fund deduction: 27.5% of remuneration, max R350 000 a year.
-- 2. UIF / UIF_EMPLOYER from 2026-03-01: 1% of UIF remuneration capped at the R17 712 monthly
--    ceiling (scaled for weekly / bi-weekly pay). SDL from 2026-03-01: 1% of leviable remuneration,
--    skipped when the employer marks itself exempt (organizations.payroll_settings.sdl_exempt).
-- 3. payroll_profiles.medical_scheme_members — people on the medical scheme (incl. the employee),
--    for the s6A medical tax credit. Date of birth stays on memberships.date_of_birth.
-- 4. pay_run_items.ordinary_hours / days_worked — payable units for hourly / daily employees.
-- 5. payslips.tax_year / ytd / employer_contributions — frozen at finalisation; locked like the
--    other calculated columns.
--
-- 6. prevent_locked_payroll_mutation (20260919120000) evaluated OLD.finalized_at for every table on
--    DELETE, so deleting any pay_run_items row — even from a draft run — failed with
--    'record "old" has no field "finalized_at"'. Same function, that one expression read via to_jsonb.
--
-- Idempotent. Roll back: delete the rows inserted here, set the 2000-01-01 rows' effective_to back
-- to NULL, drop the added columns and payslips_lock_ytd trigger, re-run 20260919120000's function.

-- ── 1. PAYE ────────────────────────────────────────────────────────────────────────────
UPDATE public.payroll_statutory_rules
SET effective_to = DATE '2025-02-28', updated_at = now()
WHERE org_id IS NULL AND code = 'PAYE' AND effective_from = DATE '2000-01-01' AND effective_to IS NULL;

INSERT INTO public.payroll_statutory_rules (
  org_id, code, name, effective_from, effective_to, calculation_type, value, employee_portion, employer_portion
)
SELECT NULL, v.code, v.name, v.effective_from, v.effective_to, 'tax_brackets', v.value::jsonb, true, false
FROM (
  VALUES
    (
      'PAYE', 'PAYE — SARS 2025/26', DATE '2025-03-01', DATE '2026-02-28',
      '{"tax_year":2026,"periods_per_year":12,"method":"annualised",
        "rebates":{"primary":17235,"secondary":9444,"tertiary":3145},
        "thresholds":{"under_65":95750,"age_65":148217,"age_75":165689},
        "medical_credits":{"main":364,"first_dependant":364,"additional":246},
        "retirement":{"rate_cap":0.275,"annual_cap":350000},
        "brackets":[
          {"above":0,"rate":0.18,"base":0},
          {"above":237100,"rate":0.26,"base":42678},
          {"above":370500,"rate":0.31,"base":77362},
          {"above":512800,"rate":0.36,"base":121475},
          {"above":673000,"rate":0.39,"base":179147},
          {"above":857900,"rate":0.41,"base":251258},
          {"above":1817000,"rate":0.45,"base":644489}]}'
    ),
    (
      'PAYE', 'PAYE — SARS 2026/27', DATE '2026-03-01', DATE '2027-02-28',
      '{"tax_year":2027,"periods_per_year":12,"method":"annualised",
        "rebates":{"primary":17820,"secondary":9765,"tertiary":3249},
        "thresholds":{"under_65":99000,"age_65":153250,"age_75":171300},
        "medical_credits":{"main":376,"first_dependant":376,"additional":254},
        "retirement":{"rate_cap":0.275,"annual_cap":350000},
        "brackets":[
          {"above":0,"rate":0.18,"base":0},
          {"above":245100,"rate":0.26,"base":44118},
          {"above":383100,"rate":0.31,"base":79998},
          {"above":530200,"rate":0.36,"base":125599},
          {"above":695800,"rate":0.39,"base":185215},
          {"above":887000,"rate":0.41,"base":259783},
          {"above":1878600,"rate":0.45,"base":666339}]}'
    )
) AS v(code, name, effective_from, effective_to, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.org_id IS NULL AND r.code = v.code AND r.effective_from = v.effective_from
);

-- ── 2. UIF / SDL ───────────────────────────────────────────────────────────────────────
UPDATE public.payroll_statutory_rules
SET effective_to = DATE '2026-02-28', updated_at = now()
WHERE org_id IS NULL AND code IN ('UIF', 'UIF_EMPLOYER', 'SDL')
  AND effective_from = DATE '2000-01-01' AND effective_to IS NULL;

INSERT INTO public.payroll_statutory_rules (
  org_id, code, name, effective_from, effective_to, calculation_type, value, employee_portion, employer_portion
)
SELECT NULL, v.code, v.name, DATE '2026-03-01', NULL, v.calculation_type, v.value::jsonb, v.employee_portion, v.employer_portion
FROM (
  VALUES
    ('UIF', 'UIF employee (1%, R17 712 ceiling)', 'capped_percent',
      '{"rate":0.01,"base":"uif","ceiling_monthly":17712}', true, false),
    ('UIF_EMPLOYER', 'UIF employer (1%, R17 712 ceiling)', 'capped_percent',
      '{"rate":0.01,"base":"uif","ceiling_monthly":17712}', false, true),
    ('SDL', 'Skills Development Levy (1%)', 'percent',
      '{"rate":0.01,"base":"leviable","employer_exemption_key":"sdl_exempt","exemption_note":"Exempt when annual leviable payroll is R500 000 or less — set in employer payroll settings."}',
      false, true)
) AS v(code, name, calculation_type, value, employee_portion, employer_portion)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.org_id IS NULL AND r.code = v.code AND r.effective_from = DATE '2026-03-01'
);

-- ── 3–5. Columns ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_profiles
  ADD COLUMN IF NOT EXISTS medical_scheme_members smallint
    CHECK (medical_scheme_members IS NULL OR medical_scheme_members BETWEEN 0 AND 20);
COMMENT ON COLUMN public.payroll_profiles.medical_scheme_members IS
  'People on the medical scheme the employee pays for, including the employee (s6A medical tax credit). NULL = not captured.';

ALTER TABLE public.pay_run_items
  ADD COLUMN IF NOT EXISTS ordinary_hours numeric(12,2),
  ADD COLUMN IF NOT EXISTS days_worked numeric(8,2);
COMMENT ON COLUMN public.pay_run_items.ordinary_hours IS 'Hourly employees: ordinary hours payable this period.';
COMMENT ON COLUMN public.pay_run_items.days_worked IS 'Daily employees: days payable this period (NULL = working days less approved unpaid leave).';

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS tax_year text,
  ADD COLUMN IF NOT EXISTS ytd jsonb,
  ADD COLUMN IF NOT EXISTS employer_contributions jsonb;
COMMENT ON COLUMN public.payslips.ytd IS
  'Year-to-date totals frozen at finalisation: finalized pay runs of this company in the same SARS tax year, including this one.';

CREATE OR REPLACE FUNCTION public.payslips_lock_ytd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE((to_jsonb(OLD)->>'locked')::boolean, false)
     AND (NEW.ytd IS DISTINCT FROM OLD.ytd
          OR NEW.employer_contributions IS DISTINCT FROM OLD.employer_contributions
          OR NEW.tax_year IS DISTINCT FROM OLD.tax_year) THEN
    RAISE EXCEPTION 'Locked payslips cannot have their YTD or employer contributions changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payslips_lock_ytd ON public.payslips;
CREATE TRIGGER payslips_lock_ytd
  BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.payslips_lock_ytd();

-- ── 6. Lock function: DELETE on pay_run_items ──────────────────────────────────────────
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
    -- to_jsonb: OLD.finalized_at does not exist on pay_run_items / payslips rows being deleted.
    IF TG_TABLE_NAME = 'pay_runs' AND (to_jsonb(OLD)->>'finalized_at') IS NOT NULL THEN
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
