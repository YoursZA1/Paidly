-- Payroll engine + leave ledger.
-- Reuses organizations, memberships, profiles, payslips.
-- Does not create a second employee identity table.

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users does not exist. Run this in the Paidly Supabase SQL Editor.';
  END IF;
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'public.organizations does not exist. Apply supabase/schema.postgres.sql first.';
  END IF;
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
  IF to_regclass('public.payslips') IS NULL THEN
    RAISE EXCEPTION 'public.payslips does not exist.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.is_pos_only_staff()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_pos_only_staff()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = auth.uid()
            AND lower(coalesce(m.job_function, '')) = 'pos'
        );
      $body$;
    $fn$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_pos_only_staff() TO authenticated';
  END IF;
END $$;

-- ── Employee payroll profile (1:1 with membership) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text,
  full_name text,
  email text,
  job_title text,
  department text,
  employment_status text NOT NULL DEFAULT 'active',
  employment_start_date date,
  pay_frequency text NOT NULL DEFAULT 'monthly',
  pay_type text NOT NULL DEFAULT 'monthly_salary',
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  hourly_rate numeric(14,2) NOT NULL DEFAULT 0,
  daily_rate numeric(14,2) NOT NULL DEFAULT 0,
  banking jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payroll_status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id),
  UNIQUE (org_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_profiles_org_employee_number_uidx
  ON public.payroll_profiles (org_id, employee_number)
  WHERE employee_number IS NOT NULL AND length(trim(employee_number)) > 0;

CREATE INDEX IF NOT EXISTS idx_payroll_profiles_org ON public.payroll_profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_payroll_profiles_user ON public.payroll_profiles (user_id);

COMMENT ON TABLE public.payroll_profiles IS
  'Payroll attributes for an org membership. Identity stays on memberships + profiles.';

-- ── Configurable earning / deduction catalogs ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payroll_component_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('earning', 'deduction')),
  code text NOT NULL,
  name text NOT NULL,
  calculation_type text NOT NULL DEFAULT 'fixed',
  taxable boolean NOT NULL DEFAULT true,
  recurring boolean NOT NULL DEFAULT true,
  employer_portion boolean NOT NULL DEFAULT false,
  tax_treatment text NOT NULL DEFAULT 'standard',
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, code)
);

-- ── Versioned statutory rules (no hardcoded SARS rates in application code) ──

CREATE TABLE IF NOT EXISTS public.payroll_statutory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  calculation_type text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  employee_portion boolean NOT NULL DEFAULT true,
  employer_portion boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_statutory_rules_lookup
  ON public.payroll_statutory_rules (org_id, code, effective_from DESC);

COMMENT ON TABLE public.payroll_statutory_rules IS
  'Versioned payroll statutory configuration. Platform defaults use org_id NULL. Values are templates to maintain — not official SARS publications.';

-- Seed platform templates migrated from the previous client calculator so
-- existing orgs keep a starting point. Admins must maintain these.
INSERT INTO public.payroll_statutory_rules (
  org_id, code, name, effective_from, effective_to, calculation_type, value, employee_portion, employer_portion
)
SELECT NULL, v.code, v.name, DATE '2000-01-01', NULL, v.calculation_type, v.value::jsonb, v.employee_portion, v.employer_portion
FROM (
  VALUES
    (
      'PAYE',
      'PAYE (configurable template)',
      'tax_brackets',
      '{"periods_per_year":12,"rebate":17235,"medical_credit":8328,"brackets":[{"min":0,"max":237100,"rate":0.18,"base":0},{"min":237101,"max":370500,"rate":0.26,"base":42678},{"min":370501,"max":512800,"rate":0.31,"base":77362},{"min":512801,"max":673000,"rate":0.36,"base":121475},{"min":673001,"max":857900,"rate":0.39,"base":179147},{"min":857901,"max":1817000,"rate":0.41,"base":251258},{"min":1817001,"max":null,"rate":0.45,"base":644489}]}',
      true,
      false
    ),
    (
      'UIF',
      'UIF employee (configurable template)',
      'capped_percent',
      '{"rate":0.01,"cap":177.12,"base":"gross"}',
      true,
      false
    ),
    (
      'UIF_EMPLOYER',
      'UIF employer (configurable template)',
      'capped_percent',
      '{"rate":0.01,"cap":177.12,"base":"gross"}',
      false,
      true
    ),
    (
      'SDL',
      'SDL employer (configurable template)',
      'percent',
      '{"rate":0.01,"base":"gross"}',
      false,
      true
    )
) AS v(code, name, calculation_type, value, employee_portion, employer_portion)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_statutory_rules r
  WHERE r.org_id IS NULL AND r.code = v.code AND r.effective_from = DATE '2000-01-01'
);

-- ── Pay runs ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date,
  frequency text NOT NULL DEFAULT 'monthly',
  run_type text NOT NULL DEFAULT 'regular',
  original_pay_run_id uuid REFERENCES public.pay_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  employee_count integer NOT NULL DEFAULT 0,
  gross_total numeric(14,2) NOT NULL DEFAULT 0,
  deductions_total numeric(14,2) NOT NULL DEFAULT 0,
  net_total numeric(14,2) NOT NULL DEFAULT 0,
  calculated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end)
);

CREATE UNIQUE INDEX IF NOT EXISTS pay_runs_org_period_regular_uidx
  ON public.pay_runs (org_id, period_start, period_end, frequency)
  WHERE status <> 'cancelled' AND run_type = 'regular';

CREATE INDEX IF NOT EXISTS idx_pay_runs_org ON public.pay_runs (org_id, period_start DESC);

CREATE TABLE IF NOT EXISTS public.pay_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pay_run_id uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  payroll_profile_id uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE RESTRICT,
  membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text,
  employee_name text,
  status text NOT NULL DEFAULT 'pending',
  base_pay numeric(14,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(12,2) NOT NULL DEFAULT 0,
  overtime_rate numeric(12,2) NOT NULL DEFAULT 0,
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0,
  earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_pay numeric(14,2) NOT NULL DEFAULT 0,
  taxable_income numeric(14,2) NOT NULL DEFAULT 0,
  statutory_deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  payslip_id uuid REFERENCES public.payslips(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_run_id, payroll_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_pay_run_items_run ON public.pay_run_items (pay_run_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_items_user ON public.pay_run_items (org_id, user_id);

-- ── Extend existing payslips (issued document; not employee source of truth) ─

ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS pay_run_id uuid REFERENCES public.pay_runs(id) ON DELETE SET NULL;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS pay_run_item_id uuid;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS payroll_profile_id uuid REFERENCES public.payroll_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS calculation_breakdown jsonb;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS leave_summary jsonb;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payslips_pay_run ON public.payslips (pay_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_profile ON public.payslips (payroll_profile_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payslips_pay_run_item_id_fkey'
  ) THEN
    ALTER TABLE public.payslips
      ADD CONSTRAINT payslips_pay_run_item_id_fkey
      FOREIGN KEY (pay_run_item_id) REFERENCES public.pay_run_items(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX payslips_org_number_uidx
    ON public.payslips (org_id, payslip_number)
    WHERE payslip_number IS NOT NULL AND length(trim(payslip_number)) > 0;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'payslips_org_number_uidx skipped — existing duplicate payslip_number values';
WHEN duplicate_table THEN
  NULL;
END $$;

-- ── Leave ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  accrual_method text NOT NULL DEFAULT 'annual',
  days_per_year numeric(8,2) NOT NULL DEFAULT 0,
  max_balance numeric(8,2),
  carry_over_days numeric(8,2) NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  exclude_weekends boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_profile_id uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  leave_year integer NOT NULL,
  entitled numeric(8,2) NOT NULL DEFAULT 0,
  accrued numeric(8,2) NOT NULL DEFAULT 0,
  used numeric(8,2) NOT NULL DEFAULT 0,
  pending numeric(8,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_profile_id, leave_type_id, leave_year)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_profile_id uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  half_day boolean NOT NULL DEFAULT false,
  working_days numeric(8,2) NOT NULL DEFAULT 0,
  reason text,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_org_status ON public.leave_requests (org_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON public.leave_requests (user_id, start_date DESC);

CREATE TABLE IF NOT EXISTS public.leave_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_profile_id uuid NOT NULL REFERENCES public.payroll_profiles(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  leave_request_id uuid REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  leave_year integer NOT NULL,
  kind text NOT NULL,
  days numeric(8,2) NOT NULL,
  balance_after numeric(8,2),
  reason text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_transactions_profile
  ON public.leave_transactions (payroll_profile_id, leave_type_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payroll_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  record_type text,
  record_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_org
  ON public.payroll_audit_logs (org_id, created_at DESC);

-- ── Updated-at triggers ──────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payroll_profiles',
    'payroll_component_types',
    'payroll_statutory_rules',
    'pay_runs',
    'pay_run_items',
    'leave_types',
    'leave_balances',
    'leave_requests'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      t, t
    );
  END LOOP;
END $$;

-- ── Lock finalized payroll ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_locked_payroll_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
  END IF;
  IF TG_TABLE_NAME = 'payslips' AND OLD.locked IS TRUE THEN
    IF NEW.gross_pay IS DISTINCT FROM OLD.gross_pay
       OR NEW.net_pay IS DISTINCT FROM OLD.net_pay
       OR NEW.basic_salary IS DISTINCT FROM OLD.basic_salary
       OR NEW.total_deductions IS DISTINCT FROM OLD.total_deductions
       OR NEW.calculation_breakdown IS DISTINCT FROM OLD.calculation_breakdown THEN
      RAISE EXCEPTION 'Locked payslips cannot have their calculated amounts changed';
    END IF;
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pay_runs_lock ON public.pay_runs;
CREATE TRIGGER pay_runs_lock
  BEFORE UPDATE ON public.pay_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

DROP TRIGGER IF EXISTS payslips_lock ON public.payslips;
CREATE TRIGGER payslips_lock
  BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

DROP TRIGGER IF EXISTS pay_run_items_lock ON public.pay_run_items;
CREATE TRIGGER pay_run_items_lock
  BEFORE UPDATE ON public.pay_run_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_component_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_statutory_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.payroll_profiles TO authenticated;
GRANT SELECT ON public.payroll_component_types TO authenticated;
GRANT SELECT ON public.payroll_statutory_rules TO authenticated;
GRANT SELECT ON public.pay_runs TO authenticated;
GRANT SELECT ON public.pay_run_items TO authenticated;
GRANT SELECT ON public.leave_types TO authenticated;
GRANT SELECT ON public.leave_balances TO authenticated;
GRANT SELECT ON public.leave_requests TO authenticated;
GRANT SELECT ON public.leave_transactions TO authenticated;
GRANT SELECT ON public.payroll_audit_logs TO authenticated;

-- Writes go through /api (service role). Authenticated clients may SELECT only.

CREATE OR REPLACE FUNCTION public.is_payroll_admin_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_admin_for_org(target_org_id)
    AND NOT public.is_pos_only_staff();
$$;

GRANT EXECUTE ON FUNCTION public.is_payroll_admin_for_org(uuid) TO authenticated;

DROP POLICY IF EXISTS "payroll_profiles_select" ON public.payroll_profiles;
CREATE POLICY "payroll_profiles_select" ON public.payroll_profiles
  FOR SELECT USING (
    public.is_admin()
    OR (
      NOT public.is_pos_only_staff()
      AND (
        user_id = auth.uid()
        OR public.is_company_admin_for_org(org_id)
      )
    )
  );

DROP POLICY IF EXISTS "payroll_components_select" ON public.payroll_component_types;
CREATE POLICY "payroll_components_select" ON public.payroll_component_types
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );

DROP POLICY IF EXISTS "payroll_statutory_select" ON public.payroll_statutory_rules;
CREATE POLICY "payroll_statutory_select" ON public.payroll_statutory_rules
  FOR SELECT USING (
    org_id IS NULL
    OR public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );

DROP POLICY IF EXISTS "pay_runs_select" ON public.pay_runs;
CREATE POLICY "pay_runs_select" ON public.pay_runs
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );

DROP POLICY IF EXISTS "pay_run_items_select" ON public.pay_run_items;
CREATE POLICY "pay_run_items_select" ON public.pay_run_items
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR (user_id = auth.uid() AND NOT public.is_pos_only_staff())
  );

DROP POLICY IF EXISTS "leave_types_select" ON public.leave_types;
CREATE POLICY "leave_types_select" ON public.leave_types
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = leave_types.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leave_balances_select" ON public.leave_balances;
CREATE POLICY "leave_balances_select" ON public.leave_balances
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.payroll_profiles p
      WHERE p.id = leave_balances.payroll_profile_id
        AND p.user_id = auth.uid()
        AND NOT public.is_pos_only_staff()
    )
  );

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR (user_id = auth.uid() AND NOT public.is_pos_only_staff())
  );

DROP POLICY IF EXISTS "leave_transactions_select" ON public.leave_transactions;
CREATE POLICY "leave_transactions_select" ON public.leave_transactions
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.payroll_profiles p
      WHERE p.id = leave_transactions.payroll_profile_id
        AND p.user_id = auth.uid()
        AND NOT public.is_pos_only_staff()
    )
  );

DROP POLICY IF EXISTS "payroll_audit_select" ON public.payroll_audit_logs;
CREATE POLICY "payroll_audit_select" ON public.payroll_audit_logs
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );
