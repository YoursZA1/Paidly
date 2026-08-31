-- Canonical SaaS feature key `pos` on Business+ catalog rows.
-- Enforcement is FAMILY_FEATURES + requireFeature('pos') — not a per-user/org allowlist.

DO $$
BEGIN
  IF to_regclass('public.plans') IS NULL THEN
    RAISE NOTICE 'plans missing — skip pos feature catalog row update';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plans'
      AND column_name = 'features'
  ) THEN
    RAISE NOTICE 'plans.features missing — skip pos feature catalog row update';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plans'
      AND column_name = 'plan_family'
  ) THEN
    UPDATE public.plans
    SET features = COALESCE(features, '[]'::jsonb) || '["pos"]'::jsonb
    WHERE (
        plan_family IN ('business', 'growth', 'enterprise')
        OR slug IN (
          'sme',
          'corporate',
          'business_monthly',
          'business_annual',
          'growth_monthly',
          'growth_annual',
          'enterprise_custom'
        )
      )
      AND NOT (COALESCE(features, '[]'::jsonb) ? 'pos');
  ELSE
    UPDATE public.plans
    SET features = COALESCE(features, '[]'::jsonb) || '["pos"]'::jsonb
    WHERE slug IN (
        'sme',
        'corporate',
        'business_monthly',
        'business_annual',
        'growth_monthly',
        'growth_annual',
        'enterprise_custom'
      )
      AND NOT (COALESCE(features, '[]'::jsonb) ? 'pos');
  END IF;
END $$;
