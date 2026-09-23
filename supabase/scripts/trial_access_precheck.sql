-- Read-only pre-check. Run BEFORE deploying 20260923120000_finite_admin_trials_expire.sql.
-- Nothing is written.
--
-- Shows every subscription whose access changes under the corrected trial rule, so you can decide
-- per company (extend the trial, or activate indefinitely) before anything expires.

-- 1. Admin-granted trials already past their end date.
--    These currently have access and will LOSE it (they should have ended on trial_ends_at).
SELECT
  'admin trial already overdue' AS finding,
  s.id,
  s.company_id,
  s.email,
  s.plan_family,
  s.status,
  s.trial_ends_at,
  date_trunc('day', now() - s.trial_ends_at) AS overdue_by,
  s.subscription_source,
  s.admin_override
FROM public.subscriptions s
WHERE lower(trim(coalesce(s.status, ''))) IN ('trialing', 'trial')
  AND s.trial_ends_at IS NOT NULL
  AND s.trial_ends_at < now()
  AND (coalesce(s.admin_override, false) OR coalesce(s.subscription_source, '') = 'admin')

UNION ALL

-- 2. Non-admin trials with NO end date.
--    These currently have access and will LOSE it (open-ended self-serve trials are not supported).
--    If any of these are legitimate, give them an explicit end date or activate them first.
SELECT
  'self-serve trial with no end date' AS finding,
  s.id,
  s.company_id,
  s.email,
  s.plan_family,
  s.status,
  s.trial_ends_at,
  NULL AS overdue_by,
  s.subscription_source,
  s.admin_override
FROM public.subscriptions s
WHERE lower(trim(coalesce(s.status, ''))) IN ('trialing', 'trial')
  AND s.trial_ends_at IS NULL
  AND NOT (coalesce(s.admin_override, false) OR coalesce(s.subscription_source, '') = 'admin')

UNION ALL

-- 3. Indefinite admin trials (no end date). These KEEP access — listed so you can confirm each one
--    is intentional. Consider converting them to "Activate indefinitely" (status = active).
SELECT
  'indefinite admin trial (keeps access)' AS finding,
  s.id,
  s.company_id,
  s.email,
  s.plan_family,
  s.status,
  s.trial_ends_at,
  NULL AS overdue_by,
  s.subscription_source,
  s.admin_override
FROM public.subscriptions s
WHERE lower(trim(coalesce(s.status, ''))) IN ('trialing', 'trial')
  AND s.trial_ends_at IS NULL
  AND (coalesce(s.admin_override, false) OR coalesce(s.subscription_source, '') = 'admin')

ORDER BY finding, trial_ends_at NULLS LAST;
