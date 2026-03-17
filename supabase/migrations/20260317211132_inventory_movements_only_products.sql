-- Enforce that inventory movements can only reference product rows
-- in the shared public.services catalog.

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS only_products;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT only_products CHECK (
    product_id IN (
      SELECT id FROM public.services WHERE type = 'product'
    )
  );

