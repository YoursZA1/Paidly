-- Hard guard: prevent stock from ever going negative on services

CREATE OR REPLACE FUNCTION public.prevent_negative_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Stock cannot go negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_stock_before_update ON public.services;

CREATE TRIGGER check_stock_before_update
BEFORE UPDATE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.prevent_negative_stock();

