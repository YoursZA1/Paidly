-- Supabase Security Advisor: Function Search Path Mutable
-- Fix: set an explicit search_path so SECURITY DEFINER / trigger functions
-- don’t run with a mutable caller search_path.
--
-- Safe to apply repeatedly.

ALTER FUNCTION public.update_updated_at_column() SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_admin() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_business_goals_updated_at() SET search_path = pg_catalog, public;

ALTER FUNCTION public.handle_invoice_reversal() SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_negative_stock() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_invoice_paid() SET search_path = pg_catalog, public;
ALTER FUNCTION public.ensure_inventory_products_only() SET search_path = pg_catalog, public;

-- Some projects may also have a different timestamp helper named set_updated_at()
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public';
  EXCEPTION
    WHEN undefined_function THEN
      -- Ignore if this function doesn’t exist (or has a different signature).
      NULL;
  END;
END $$;

