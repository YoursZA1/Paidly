-- Keep services.type consistent with item_type for inventory triggers.
-- Safe to re-run.

-- Backfill: if a row is marked as product via item_type, enforce type='product'.
UPDATE public.services
SET type = 'product'
WHERE item_type = 'product'
  AND type IS DISTINCT FROM 'product';

-- And ensure non-product item_type do not keep type='product'.
UPDATE public.services
SET type = 'service'
WHERE item_type IS DISTINCT FROM 'product'
  AND type IS DISTINCT FROM 'service';

CREATE OR REPLACE FUNCTION public.sync_services_type_from_item_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type = 'product' THEN
    NEW.type := 'product';
  ELSE
    NEW.type := 'service';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_services_type_from_item_type ON public.services;
CREATE TRIGGER tr_sync_services_type_from_item_type
BEFORE INSERT OR UPDATE OF item_type ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.sync_services_type_from_item_type();

