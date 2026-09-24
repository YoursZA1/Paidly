-- Company access row: only the company OWNER's company-less subscription rows count (2026-09-24).
--
-- company_access_subscription(company, user) used to add company-less rows held by the caller
-- (p_user_id) as well as by the owner. The plan feature guard (paidly_assert_plan_feature) calls it
-- with the writing user, so a member holding a personal, company-less paid row (legacy ITN without a
-- company hint) unlocked Business/Growth writes for an employer that had not paid. Server-side the
-- same rule lived in server/src/billing/entitlements.js loadCompanySubscriptionRows; both now read
-- the owner's rows only.
--
-- Current checkouts are not affected: /api/subscriptions/create always stamps company_id, and the
-- owner's company-less rows still count. Only legacy company-less rows held by a non-owner stop
-- counting — list them before deploying (see below). p_user_id keeps its meaning when there is no company
-- (a user without an organization resolves by their own rows), and the signature is unchanged, so
-- mirror_company_plan_to_profiles and paidly_company_plan keep working as they are.
-- Review rows this stops counting with supabase/scripts/subscriptions_ownership_report.sql (section 4).
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.company_access_subscription(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.*
  FROM public.subscriptions s
  WHERE (p_company_id IS NOT NULL AND s.company_id = p_company_id)
     OR (p_company_id IS NOT NULL AND s.company_id IS NULL AND s.user_id IN (
           SELECT o.owner_id FROM public.organizations o WHERE o.id = p_company_id AND o.owner_id IS NOT NULL
        ))
     OR (p_company_id IS NULL AND p_user_id IS NOT NULL AND s.user_id = p_user_id)
  ORDER BY
    CASE
      WHEN public.subscription_row_has_access(s) THEN 100
      WHEN lower(s.status) IN ('pending', 'processing') THEN 20
      WHEN lower(s.status) = 'expired' THEN 10
      ELSE 0
    END DESC,
    coalesce(s.updated_at, s.created_at) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.company_access_subscription(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_access_subscription(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.company_access_subscription(uuid, uuid) IS
  'The subscription row that decides a company''s package and access: company rows plus the OWNER''s company-less rows (never another member''s). Same ranking and rows as server/src/billing/entitlements.js.';
