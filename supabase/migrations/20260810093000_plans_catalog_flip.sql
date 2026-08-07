-- Catalog go-live: activate new Starter/Business/Growth/Enterprise; hide legacy from public catalog.
-- Pin subscription.amount from plans so grandfathered ITNs keep matching after legacy deactivation.
--
-- Safe to re-run. Requires plan family columns + seeded rows from
-- 20260810090000_plans_families_and_new_pricing.sql (ensured below if missing).

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_family text,
  ADD COLUMN IF NOT EXISTS tier_rank integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interval_months integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_legacy boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS limits jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_sales boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Backfill amount on non-terminal subscriptions before flipping catalog.
UPDATE public.subscriptions s
SET amount = p.amount,
    currency = COALESCE(NULLIF(s.currency, ''), p.currency, 'ZAR'),
    updated_at = now()
FROM public.plans p
WHERE s.plan_id = p.id
  AND s.amount IS NULL
  AND lower(trim(coalesce(s.status, ''))) NOT IN ('cancelled', 'canceled', 'expired', 'failed');

UPDATE public.subscriptions s
SET amount = p.amount,
    updated_at = now()
FROM public.plans p
WHERE s.plan_id IS NULL
  AND s.amount IS NULL
  AND p.slug = coalesce(s.plan_slug, s.plan, s.current_plan)
  AND lower(trim(coalesce(s.status, ''))) NOT IN ('cancelled', 'canceled', 'expired', 'failed');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.plans WHERE slug = 'starter_monthly'
  ) THEN
    RAISE EXCEPTION
      'Missing new catalog rows (e.g. starter_monthly). Run migration 20260810090000_plans_families_and_new_pricing.sql first, then re-run this flip.';
  END IF;
END $$;

-- Activate new public catalog.
UPDATE public.plans
SET active = true,
    is_public = true,
    is_legacy = false
WHERE slug IN (
  'starter_monthly', 'starter_annual',
  'business_monthly', 'business_annual',
  'growth_monthly', 'growth_annual',
  'enterprise_custom'
);

-- Deactivate legacy from public catalog (rows kept for ITN / loadPlanById).
UPDATE public.plans
SET active = false,
    is_public = false,
    is_legacy = true
WHERE slug IN ('individual', 'sme', 'corporate');
