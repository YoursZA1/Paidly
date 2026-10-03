-- Platform totals for Admin invoice money, invoice/POS usage, and SaaS payment_history.
-- Grouped counts and sums only. No organisation, business, document, or payment id.
-- service_role (the admin API) may execute these. Signed-in tenants may not.

CREATE OR REPLACE FUNCTION public.admin_invoice_platform_totals()
RETURNS TABLE (
  generated bigint,
  paid_count bigint,
  paid_volume numeric,
  outstanding_volume numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE lower(status) IN ('paid', 'partially_paid'))::bigint,
    coalesce(sum(total_amount) FILTER (WHERE lower(status) = 'paid'), 0),
    coalesce(sum(total_amount) FILTER (
      WHERE lower(status) IN ('sent', 'overdue', 'viewed', 'partially_paid', 'unpaid', 'issued')
    ), 0)
  FROM public.invoices
$$;

CREATE OR REPLACE FUNCTION public.admin_invoice_status_counts()
RETURNS TABLE (
  status text,
  status_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(status, 'unknown')), count(*)::bigint
  FROM public.invoices
  GROUP BY 1
$$;

CREATE OR REPLACE FUNCTION public.admin_pos_usage_buckets()
RETURNS TABLE (
  status text,
  payment_method text,
  sale_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(coalesce(status, 'unknown')),
    lower(coalesce(nullif(payment_method, ''), 'unknown')),
    count(*)::bigint
  FROM public.pos_sales_events
  GROUP BY 1, 2
$$;

CREATE OR REPLACE FUNCTION public.admin_saas_payment_buckets()
RETURNS TABLE (
  payment_status text,
  payment_method text,
  currency text,
  payment_count bigint,
  amount_sum numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(coalesce(payment_status, 'unknown')),
    lower(coalesce(nullif(payment_method, ''), 'payfast')),
    upper(coalesce(nullif(currency, ''), 'ZAR')),
    count(*)::bigint,
    coalesce(sum(amount), 0)
  FROM public.payment_history
  GROUP BY 1, 2, 3
$$;

REVOKE ALL ON FUNCTION public.admin_invoice_platform_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_invoice_status_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_pos_usage_buckets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_saas_payment_buckets() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_invoice_platform_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_invoice_status_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pos_usage_buckets() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_saas_payment_buckets() TO service_role;

NOTIFY pgrst, 'reload schema';
