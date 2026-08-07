-- Paidly billing cutover: plan families + new Starter/Business/Growth/Enterprise catalog.
-- New rows seeded with active=false (catalog flip is a later migration).
-- Do NOT UPDATE amount on live legacy slugs (breaks PayFast ITN amount checks).

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_family text,
  ADD COLUMN IF NOT EXISTS tier_rank integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interval_months integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_legacy boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS limits jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_sales boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_family_allowed'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_family_allowed
      CHECK (plan_family IS NULL OR plan_family IN ('starter', 'business', 'growth', 'enterprise'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS plans_family_cycle_idx
  ON public.plans (plan_family, billing_cycle)
  WHERE active IS TRUE;

COMMENT ON COLUMN public.plans.plan_family IS
  'Entitlement family (starter|business|growth|enterprise). Monthly/annual share the same family.';
COMMENT ON COLUMN public.plans.is_legacy IS
  'True for grandfathered Individual/SME/Corporate rows — keep forever for ITN amount resolution.';
COMMENT ON COLUMN public.plans.is_public IS
  'When true and active, included in GET /api/subscriptions/plans.';
COMMENT ON COLUMN public.plans.contact_sales IS
  'Enterprise / custom — never reaches PayFast checkout.';
COMMENT ON COLUMN public.plans.interval_months IS
  'Period length for ITN period_end math (1 monthly, 12 annual).';

-- Backfill legacy catalog rows (price unchanged).
UPDATE public.plans SET
  plan_family = 'starter',
  tier_rank = 1,
  interval_months = 1,
  is_public = true,
  is_legacy = true,
  limits = '{"seats":1,"companies":1}'::jsonb,
  sort_order = 10,
  contact_sales = false
WHERE slug = 'individual';

UPDATE public.plans SET
  plan_family = 'business',
  tier_rank = 2,
  interval_months = 1,
  is_public = true,
  is_legacy = true,
  limits = '{"seats":5,"companies":1}'::jsonb,
  sort_order = 20,
  contact_sales = false
WHERE slug = 'sme';

UPDATE public.plans SET
  plan_family = 'growth',
  tier_rank = 3,
  interval_months = 1,
  is_public = true,
  is_legacy = true,
  limits = '{"seats":null,"companies":null}'::jsonb,
  sort_order = 30,
  contact_sales = false
WHERE slug = 'corporate';

-- New public catalog (inactive until catalog-flip migration).
INSERT INTO public.plans (
  slug, name, description, billing_cycle, amount, currency, payfast_item_name,
  features, active, plan_family, tier_rank, interval_months, is_public, is_legacy,
  limits, contact_sales, sort_order
)
VALUES
  (
    'starter_monthly', 'Starter', 'Freelancers & individuals.',
    'monthly', 50.00, 'ZAR', 'Paidly Starter',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports"]'::jsonb,
    false, 'starter', 1, 1, true, false,
    '{"seats":1,"companies":1}'::jsonb, false, 100
  ),
  (
    'starter_annual', 'Starter', 'Freelancers & individuals (annual — 2 months free).',
    'annual', 500.00, 'ZAR', 'Paidly Starter (Annual)',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports"]'::jsonb,
    false, 'starter', 1, 12, true, false,
    '{"seats":1,"companies":1}'::jsonb, false, 101
  ),
  (
    'business_monthly', 'Business', 'SMEs — team, inventory, payroll docs.',
    'monthly', 150.00, 'ZAR', 'Paidly Business',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports","inventory","expenses","purchase_orders","payslips","vat_reports","email_templates","recurring_invoices","support_priority","templates"]'::jsonb,
    false, 'business', 2, 1, true, false,
    '{"seats":5,"companies":1}'::jsonb, false, 200
  ),
  (
    'business_annual', 'Business', 'SMEs (annual — 2 months free).',
    'annual', 1500.00, 'ZAR', 'Paidly Business (Annual)',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports","inventory","expenses","purchase_orders","payslips","vat_reports","email_templates","recurring_invoices","support_priority","templates"]'::jsonb,
    false, 'business', 2, 12, true, false,
    '{"seats":5,"companies":1}'::jsonb, false, 201
  ),
  (
    'growth_monthly', 'Growth', 'Growing businesses — unlimited team & integrations.',
    'monthly', 350.00, 'ZAR', 'Paidly Growth',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports","inventory","expenses","purchase_orders","payslips","vat_reports","email_templates","recurring_invoices","support_priority","templates","departments","approval_workflows","leave_management","reports_advanced","advanced_reports","api_access","integrations","multi_company","affiliate_program","white_label"]'::jsonb,
    false, 'growth', 3, 1, true, false,
    '{"seats":null,"companies":null}'::jsonb, false, 300
  ),
  (
    'growth_annual', 'Growth', 'Growing businesses (annual — 2 months free).',
    'annual', 3500.00, 'ZAR', 'Paidly Growth (Annual)',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports","inventory","expenses","purchase_orders","payslips","vat_reports","email_templates","recurring_invoices","support_priority","templates","departments","approval_workflows","leave_management","reports_advanced","advanced_reports","api_access","integrations","multi_company","affiliate_program","white_label"]'::jsonb,
    false, 'growth', 3, 12, true, false,
    '{"seats":null,"companies":null}'::jsonb, false, 301
  ),
  (
    'enterprise_custom', 'Enterprise', 'Large organisations — custom pricing.',
    'monthly', 0.00, 'ZAR', 'Paidly Enterprise',
    '["invoices","quotes","clients","reports_basic","email_send","documents_pdf","support_basic","email","basic_reports","inventory","expenses","purchase_orders","payslips","vat_reports","email_templates","recurring_invoices","support_priority","templates","departments","approval_workflows","leave_management","reports_advanced","advanced_reports","api_access","integrations","multi_company","affiliate_program","white_label","sso","dedicated_support","custom_contract"]'::jsonb,
    false, 'enterprise', 4, 1, true, false,
    '{"seats":null,"companies":null}'::jsonb, true, 400
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  billing_cycle = EXCLUDED.billing_cycle,
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency,
  payfast_item_name = EXCLUDED.payfast_item_name,
  features = EXCLUDED.features,
  plan_family = EXCLUDED.plan_family,
  tier_rank = EXCLUDED.tier_rank,
  interval_months = EXCLUDED.interval_months,
  is_public = EXCLUDED.is_public,
  is_legacy = EXCLUDED.is_legacy,
  limits = EXCLUDED.limits,
  contact_sales = EXCLUDED.contact_sales,
  sort_order = EXCLUDED.sort_order;
  -- Do not flip active here — catalog-flip migration owns go-live.
