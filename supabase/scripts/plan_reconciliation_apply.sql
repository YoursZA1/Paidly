-- Plan reconciliation APPLY. Run only after reviewing plan_reconciliation_report.sql.
-- Requires migration 20260921140000_canonical_plan_entitlements.sql.
--
-- What it does (and nothing else):
--   1. Attaches subscriptions with company_id NULL to the user's oldest owned company — the company
--      the entitlement resolver reads (server/src/billing/httpAuth.js resolveUserCompanyId).
--   2. Re-mirrors every company's canonical subscription into all member profiles.
--   0. (20260923150000) Re-derives plan_family where it drifted from plan_slug — the package the
--      row was actually paid/assigned on. Review the "plan_family drift" section of the report first.
--
-- What it never does:
--   - change any subscription's plan/plan_slug, status, amount, dates or PayFast fields
--   - delete rows or touch payment_history / subscription_events
--   - grant a package to companies that only had profiles.plan set (decide those per company with
--     POST /api/admin/subscriptions { action: "set_company_plan" }, which is audited)
--
-- Runs in one transaction; the SELECTs at the end show the effect before COMMIT.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.mirror_company_plan_to_profiles(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/20260921140000_canonical_plan_entitlements.sql first.';
  END IF;
END $$;

-- 0. plan_family drift → follow plan_slug (then plan).
UPDATE public.subscriptions s
SET plan_family = coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan)),
    updated_at = now()
WHERE coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan)) IS NOT NULL
  AND s.plan_family IS DISTINCT FROM coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan));

-- 1. Orphan subscriptions → owner's company.
UPDATE public.subscriptions s
SET company_id = (
      SELECT o.id FROM public.organizations o
      WHERE o.owner_id = s.user_id
      ORDER BY o.created_at ASC
      LIMIT 1
    ),
    updated_at = now()
WHERE s.company_id IS NULL
  AND s.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = s.user_id);

-- 2. Re-mirror every company (and user-only subscriptions without a company).
SELECT public.mirror_company_plan_to_profiles(o.id, NULL) FROM public.organizations o;
SELECT public.mirror_company_plan_to_profiles(NULL, s.user_id)
FROM (SELECT DISTINCT user_id FROM public.subscriptions WHERE company_id IS NULL AND user_id IS NOT NULL) s;

-- Review: companies whose owner profile still disagrees with the canonical subscription
-- (expected: only companies with no subscription row, which this script deliberately leaves alone).
SELECT o.name, p.email, p.plan AS profile_plan,
       public.normalize_plan_family((public.company_access_subscription(o.id)).plan_family) AS canonical_plan
FROM public.organizations o
JOIN public.profiles p ON p.id = o.owner_id
WHERE public.normalize_plan_family(p.plan)
      IS DISTINCT FROM public.normalize_plan_family((public.company_access_subscription(o.id)).plan_family);

-- COMMIT;   -- uncomment after reviewing the output above
-- ROLLBACK; -- or discard
