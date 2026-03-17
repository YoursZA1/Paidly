-- Enforce that inventory movements can only reference product rows
-- in the shared public.services catalog.

-- Old CHECK constraint (not supported on this Postgres variant) is removed
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS only_products;

-- Trigger-based guard: ensure referenced service is a product
CREATE OR REPLACE FUNCTION public.ensure_inventory_products_only()
RETURNS TRIGGER AS $$
DECLARE
  svc_type text;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO svc_type
  FROM public.services
  WHERE id = NEW.product_id;

  IF svc_type IS DISTINCT FROM 'product' THEN
    RAISE EXCEPTION 'inventory_movements.product_id must reference a product-type service';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_inventory_products_only ON public.inventory_movements;

CREATE TRIGGER ensure_inventory_products_only
BEFORE INSERT OR UPDATE ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.ensure_inventory_products_only();

