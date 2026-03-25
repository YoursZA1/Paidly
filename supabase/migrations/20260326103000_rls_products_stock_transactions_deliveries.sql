-- RLS policies for Base44 inventory tables: products, stock_transactions, deliveries
--
-- These tables use Base44-style text ids and store created_by_id as text.
-- We scope user access to rows where:
-- - row.created_by_id = auth.uid()::text, OR
-- - (for child tables) the referenced product belongs to the user
--
-- Admins (public.is_admin()) have full access.
-- Safe to re-run (drops/recreates policies).

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- -----------------------
-- products
-- -----------------------
DROP POLICY IF EXISTS "admin full access products" ON public.products;
CREATE POLICY "admin full access products" ON public.products
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users own products" ON public.products;
CREATE POLICY "users own products" ON public.products
  FOR ALL
  USING (products.created_by_id = (SELECT auth.uid())::text)
  WITH CHECK (products.created_by_id = (SELECT auth.uid())::text);

-- -----------------------
-- stock_transactions
-- -----------------------
DROP POLICY IF EXISTS "admin full access stock_transactions" ON public.stock_transactions;
CREATE POLICY "admin full access stock_transactions" ON public.stock_transactions
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users own stock_transactions" ON public.stock_transactions;
CREATE POLICY "users own stock_transactions" ON public.stock_transactions
  FOR ALL
  USING (
    stock_transactions.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = stock_transactions.product_id
        AND p.created_by_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    stock_transactions.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = stock_transactions.product_id
        AND p.created_by_id = (SELECT auth.uid())::text
    )
  );

-- -----------------------
-- deliveries
-- -----------------------
DROP POLICY IF EXISTS "admin full access deliveries_v2" ON public.deliveries;
CREATE POLICY "admin full access deliveries_v2" ON public.deliveries
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users own deliveries_v2" ON public.deliveries;
CREATE POLICY "users own deliveries_v2" ON public.deliveries
  FOR ALL
  USING (
    deliveries.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = deliveries.product_id
        AND p.created_by_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    deliveries.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = deliveries.product_id
        AND p.created_by_id = (SELECT auth.uid())::text
    )
  );

