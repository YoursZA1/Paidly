-- One current subscription per business. Historical rows stay for billing, audit, and PayFast.
-- Owner key is company_id. A user with subscriptions on exactly one company has their
-- company-less rows folded into that company (they are the same business). A user on more than
-- one company keeps a separate current row per company. Email is not an owner key.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.subscriptions.is_current IS
  'Exactly one true row per company (or per user when the user has no company subscription). Other rows are history and are not deleted.';

WITH user_company AS (
  SELECT user_id, (array_agg(company_id))[1] AS company_id
  FROM (
    SELECT DISTINCT user_id, company_id
    FROM public.subscriptions
    WHERE user_id IS NOT NULL
      AND company_id IS NOT NULL
  ) distinct_pairs
  GROUP BY user_id
  HAVING COUNT(*) = 1
),
ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY
        CASE
          WHEN s.company_id IS NOT NULL THEN 'c:' || s.company_id::text
          WHEN uc.company_id IS NOT NULL THEN 'c:' || uc.company_id::text
          WHEN s.user_id IS NOT NULL THEN 'u:' || s.user_id::text
          ELSE 'row:' || s.id::text
        END
      ORDER BY
        CASE
          WHEN s.status = 'active' THEN 100
          WHEN s.status IN ('trialing', 'trial') THEN 80
          WHEN s.status IN ('pending', 'processing') THEN 60
          WHEN s.status = 'past_due' THEN 40
          WHEN s.status = 'suspended' THEN 35
          WHEN s.status = 'expired' THEN 20
          WHEN s.status IN ('cancelled', 'canceled') THEN 10
          WHEN s.status = 'failed' THEN 5
          ELSE 0
        END DESC,
        s.updated_at DESC NULLS LAST,
        s.created_at DESC NULLS LAST,
        s.id DESC
    ) AS rn
  FROM public.subscriptions s
  LEFT JOIN user_company uc ON uc.user_id = s.user_id AND s.company_id IS NULL
)
UPDATE public.subscriptions AS s
SET is_current = (ranked.rn = 1)
FROM ranked
WHERE s.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_company
  ON public.subscriptions (company_id)
  WHERE is_current = true AND company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_user
  ON public.subscriptions (user_id)
  WHERE is_current = true AND company_id IS NULL AND user_id IS NOT NULL;
