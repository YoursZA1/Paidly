-- READ-ONLY. Run in the Supabase SQL editor (service role). Modifies nothing.
--
-- Tenant subscription history is visible only where subscriptions.user_id = auth.uid()
-- (policy "subscriptions_user_select_own", 20260924130000). This report lists rows a tenant
-- cannot see and, where a reliable relationship exists, the candidate owner — for human review.
-- Do not bulk-update from it: a candidate is evidence, not proof of ownership.

-- 1. Summary
SELECT
  count(*)                                                        AS total_rows,
  count(*) FILTER (WHERE s.user_id IS NULL)                       AS user_id_null,
  count(*) FILTER (WHERE s.user_id IS NOT NULL AND u.id IS NULL)  AS user_id_not_an_auth_user,
  count(*) FILTER (WHERE s.company_id IS NULL)                    AS company_id_null,
  count(*) FILTER (WHERE s.company_id IS NOT NULL)                AS company_id_set,
  count(*) FILTER (WHERE s.user_id IS NOT NULL AND s.created_by IS NOT NULL
                     AND s.user_id <> s.created_by)               AS user_id_differs_from_created_by
FROM public.subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id;

-- 2. Rows invisible to every tenant (user_id NULL or not an auth user), with candidate owners.
--    candidate_by_company_owner: organizations.owner_id for the row's company_id.
--    candidate_by_email:         the single auth user whose email matches subscriptions.email.
SELECT
  s.id,
  s.status,
  s.plan,
  s.subscription_source,
  s.provider,
  s.email,
  s.user_id,
  s.created_by,
  s.company_id,
  o.owner_id                         AS candidate_by_company_owner,
  (SELECT (array_agg(au.id))[1] FROM auth.users au
    WHERE lower(au.email) = lower(s.email)
    HAVING count(*) = 1)             AS candidate_by_email,
  s.payfast_subscription_id IS NOT NULL AS has_payfast_subscription,
  s.created_at
FROM public.subscriptions s
LEFT JOIN auth.users u ON u.id = s.user_id
LEFT JOIN public.organizations o ON o.id = s.company_id
WHERE s.user_id IS NULL OR u.id IS NULL
ORDER BY s.created_at DESC;

-- 3. Live policies and grants on public.subscriptions (expect exactly one SELECT policy,
--    authenticated = SELECT only, anon = nothing).
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions';

-- Effective table privileges per API role. Expected after 20260924130000:
--   anon          → all false
--   authenticated → can_select only
--   service_role  → all true
SELECT
  r.role_name,
  has_table_privilege(r.role_name, 'public.subscriptions', 'SELECT') AS can_select,
  has_table_privilege(r.role_name, 'public.subscriptions', 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, 'public.subscriptions', 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, 'public.subscriptions', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r (role_name);

-- 4. Company-less rows held by someone who owns no company (20260924150000).
--    company_access_subscription and the server resolver count a company-less row only for the
--    company its holder OWNS. Rows listed here no longer grant any company access; before deploying,
--    review each one that currently grants access (has_access = true) — e.g. a member who paid for
--    the employer before checkout stamped company_id — and give that company its own subscription
--    through the admin console if it should keep the package.
SELECT
  s.id,
  s.status,
  coalesce(s.plan_slug, s.plan_family, s.plan) AS package,
  public.subscription_row_has_access(s)       AS has_access,
  s.user_id,
  (SELECT array_agg(m.org_id) FROM public.memberships m WHERE m.user_id = s.user_id) AS member_of_companies,
  s.subscription_source,
  s.updated_at
FROM public.subscriptions s
WHERE s.company_id IS NULL
  AND s.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = s.user_id)
ORDER BY public.subscription_row_has_access(s) DESC, s.updated_at DESC;
