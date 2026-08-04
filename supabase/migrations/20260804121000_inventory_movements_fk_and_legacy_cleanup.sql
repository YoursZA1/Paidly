-- 1) inventory_movements.product_id was only ever guarded by the
--    inventory products-only BEFORE trigger (ensure + inventory_products_only),
--    never a real FK.
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.services(id) ON DELETE CASCADE;

-- 2) Drop the orphaned Base44-import products/stock_transactions tables.
--    deliveries.product_id was repointed to public.services(id) by
--    20260327120000_deliveries_product_fk_services.sql, so deliveries has
--    no remaining dependency on public.products. No app code under src/
--    references either table (public.products or public.stock_transactions).
--    Dropping products CASCADEs to stock_transactions' FK and both tables'
--    RLS policies; stock_transactions is dropped explicitly first for clarity.
DROP TABLE IF EXISTS public.stock_transactions CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
