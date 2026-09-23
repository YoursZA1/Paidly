-- Plan reconciliation REPORT (read-only). Run in the Supabase SQL editor.
-- Requires migration 20260921140000_canonical_plan_entitlements.sql (company_access_subscription).
--
-- One row per company that has any inconsistency between the canonical company subscription and
-- the profiles mirror / other subscription rows. Nothing is written.
--
DO $$
BEGIN
  IF to_regprocedure('public.company_access_subscription(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply supabase/migrations/20260921140000_canonical_plan_entitlements.sql first — this report uses the functions it creates.';
  END IF;
END $$;

-- canonical_*     = what the app now shows and enforces (the company's access subscription row)
-- owner_profile_* = what the old UI showed (profiles.plan of the org owner)
-- issues          = why the row is listed

WITH companies AS (
  SELECT o.id AS company_id, o.name AS company_name, o.owner_id
  FROM public.organizations o
),
canon AS (
  SELECT
    c.company_id,
    c.company_name,
    c.owner_id,
    s.id AS sub_id,
    public.normalize_plan_family(coalesce(s.plan_family, s.plan_slug, s.plan)) AS canonical_plan,
    s.status AS canonical_status,
    CASE WHEN s.id IS NULL THEN false ELSE public.subscription_row_has_access(s) END AS canonical_access,
    s.subscription_source,
    s.trial_ends_at
  FROM companies c
  LEFT JOIN LATERAL (SELECT (public.company_access_subscription(c.company_id)).*) s ON true
),
rows_per_company AS (
  SELECT
    s.company_id,
    count(*) AS subscription_rows,
    count(*) FILTER (WHERE public.subscription_row_has_access(s)) AS rows_with_access,
    count(*) FILTER (WHERE lower(s.status) IN ('pending', 'processing')) AS pending_rows
  FROM public.subscriptions s
  WHERE s.company_id IS NOT NULL
  GROUP BY s.company_id
),
member_mismatch AS (
  SELECT
    k.company_id,
    count(*) FILTER (
      WHERE public.normalize_plan_family(p.plan) IS DISTINCT FROM k.canonical_plan
         OR coalesce(p.is_pro, false) IS DISTINCT FROM k.canonical_access
    ) AS members_out_of_sync,
    count(*) AS members
  FROM canon k
  JOIN public.memberships m ON m.org_id = k.company_id AND m.user_id IS NOT NULL
  JOIN public.profiles p ON p.id = m.user_id
  GROUP BY k.company_id
)
SELECT
  k.company_name,
  k.company_id,
  op.email AS owner_email,
  coalesce(k.canonical_plan, '(none)') AS canonical_plan,
  coalesce(k.canonical_status, '(no subscription)') AS canonical_status,
  k.canonical_access,
  k.subscription_source,
  op.plan AS owner_profile_plan,
  op.subscription_status AS owner_profile_status,
  op.is_pro AS owner_profile_is_pro,
  coalesce(r.subscription_rows, 0) AS subscription_rows,
  coalesce(r.rows_with_access, 0) AS rows_with_access,
  coalesce(r.pending_rows, 0) AS pending_rows,
  coalesce(mm.members_out_of_sync, 0) AS members_out_of_sync,
  array_remove(ARRAY[
    CASE WHEN k.sub_id IS NULL AND public.normalize_plan_family(op.plan) IN ('business', 'growth', 'enterprise')
      THEN 'profile says paid package but company has NO subscription (likely set on the admin Users page)' END,
    CASE WHEN k.sub_id IS NOT NULL AND public.normalize_plan_family(op.plan) IS DISTINCT FROM k.canonical_plan
      THEN 'owner profile plan != subscription plan' END,
    CASE WHEN k.sub_id IS NOT NULL AND coalesce(op.is_pro, false) IS DISTINCT FROM k.canonical_access
      THEN 'owner profile access flag != subscription access' END,
    CASE WHEN coalesce(r.rows_with_access, 0) > 1
      THEN 'multiple subscription rows grant access' END,
    CASE WHEN coalesce(r.pending_rows, 0) > 0 AND NOT k.canonical_access
      THEN 'pending checkout and no access (abandoned checkout?)' END,
    CASE WHEN coalesce(mm.members_out_of_sync, 0) > 0
      THEN 'member profiles out of sync' END,
    CASE WHEN lower(coalesce(k.canonical_status, '')) = 'trialing' AND NOT k.canonical_access
      THEN 'trial ended but row still trialing (cron not run)' END
  ], NULL) AS issues,
  CASE
    WHEN k.sub_id IS NULL AND public.normalize_plan_family(op.plan) IN ('business', 'growth', 'enterprise')
      THEN 'DECIDE: grant via admin set_company_plan (' || public.normalize_plan_family(op.plan) || ') or leave without subscription'
    WHEN k.sub_id IS NOT NULL
      THEN 'Canonical: ' || coalesce(k.canonical_plan, '?') || ' / ' || coalesce(k.canonical_status, '?') || ' — apply script re-mirrors profiles'
    ELSE 'No action'
  END AS recommendation
FROM canon k
LEFT JOIN public.profiles op ON op.id = k.owner_id
LEFT JOIN rows_per_company r ON r.company_id = k.company_id
LEFT JOIN member_mismatch mm ON mm.company_id = k.company_id
WHERE
  (k.sub_id IS NULL AND public.normalize_plan_family(op.plan) IN ('business', 'growth', 'enterprise'))
  OR (k.sub_id IS NOT NULL AND public.normalize_plan_family(op.plan) IS DISTINCT FROM k.canonical_plan)
  OR (k.sub_id IS NOT NULL AND coalesce(op.is_pro, false) IS DISTINCT FROM k.canonical_access)
  OR coalesce(r.rows_with_access, 0) > 1
  OR (coalesce(r.pending_rows, 0) > 0 AND NOT k.canonical_access)
  OR coalesce(mm.members_out_of_sync, 0) > 0
  OR (lower(coalesce(k.canonical_status, '')) = 'trialing' AND NOT k.canonical_access)
ORDER BY k.canonical_access DESC, k.company_name;

-- Subscriptions not attached to any company (the resolver reads by company first, so these are
-- invisible to members who belong to a company):
SELECT s.id, s.user_id, s.email, s.status, s.plan_family, s.subscription_source, s.updated_at,
       (SELECT o.id FROM public.organizations o WHERE o.owner_id = s.user_id ORDER BY o.created_at LIMIT 1) AS owner_company_id
FROM public.subscriptions s
WHERE s.company_id IS NULL
ORDER BY s.updated_at DESC;

-- plan_family drift (fixed going forward by 20260923150000 subscriptions_derive_plan_family).
-- The resolver reads plan_family first; these rows grant stored_family while their slug says
-- slug_family. Typical cause: a PayFast ITN that updated a trial row's plan_slug but not plan_family.
SELECT s.id, s.company_id, s.user_id, s.status, s.subscription_source,
       s.plan_family AS stored_family, s.plan_slug, s.plan,
       coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan)) AS slug_family,
       s.updated_at
FROM public.subscriptions s
WHERE coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan)) IS NOT NULL
  AND s.plan_family IS DISTINCT FROM coalesce(public.normalize_plan_family(s.plan_slug), public.normalize_plan_family(s.plan))
ORDER BY s.updated_at DESC;

-- Rows with no package at all (plan is trial/free/none/empty and no plan_family). Since
-- 20260923150000 these resolve to "no package" instead of silently becoming Starter. Assign the
-- real package per company with POST /api/admin/subscriptions { action: "set_company_plan" }.
SELECT s.id, s.company_id, s.user_id, s.email, s.status, s.plan, s.plan_slug, s.current_plan, s.updated_at
FROM public.subscriptions s
WHERE coalesce(public.normalize_plan_family(s.plan_family), public.normalize_plan_family(s.plan_slug),
               public.normalize_plan_family(s.plan), public.normalize_plan_family(s.current_plan)) IS NULL
ORDER BY s.updated_at DESC;
