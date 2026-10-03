-- Platform finance totals for Admin → Payment Intents.
-- Returns grouped counts only. No org, business, intent id, or customer.
-- service_role (the admin API) may execute it. Signed-in tenants may not.

CREATE OR REPLACE FUNCTION public.admin_payment_intent_finance_buckets()
RETURNS TABLE (
  day date,
  method text,
  product text,
  provider text,
  status text,
  currency text,
  intent_count bigint,
  amount_sum numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'Africa/Johannesburg')::date AS day,
    CASE
      WHEN lower(coalesce(metadata->>'offline_method', '')) IN ('eft', 'bank_transfer') THEN 'eft'
      WHEN lower(coalesce(metadata->>'offline_method', '')) IN ('pos', 'card', 'credit_card', 'debit_card')
        OR lower(provider) = 'card_terminal' THEN 'pos'
      WHEN lower(coalesce(metadata->>'offline_method', '')) IN ('other', 'mobile_payment', 'check') THEN 'other'
      WHEN lower(provider) = 'cash' OR lower(coalesce(metadata->>'offline_method', '')) = 'cash' THEN 'cash'
      WHEN coalesce(provider, '') <> '' AND lower(provider) <> 'cash' THEN 'digital'
      ELSE 'other'
    END AS method,
    CASE
      WHEN source_kind = 'pos' THEN 'pos'
      WHEN lower(coalesce(document_type, '')) = 'quote' THEN 'quote'
      WHEN lower(coalesce(document_type, '')) IN ('recurring', 'recurring_invoice') THEN 'recurring'
      WHEN source_kind = 'document' THEN 'invoice'
      ELSE 'other'
    END AS product,
    lower(coalesce(provider, 'unknown')) AS provider,
    lower(status) AS status,
    upper(coalesce(nullif(currency, ''), 'ZAR')) AS currency,
    count(*)::bigint AS intent_count,
    coalesce(sum(amount), 0) AS amount_sum
  FROM public.payment_intents
  GROUP BY 1, 2, 3, 4, 5, 6
$$;

REVOKE ALL ON FUNCTION public.admin_payment_intent_finance_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payment_intent_finance_buckets() TO service_role;

NOTIFY pgrst, 'reload schema';
