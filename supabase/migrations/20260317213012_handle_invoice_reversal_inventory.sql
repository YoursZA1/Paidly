-- Refund / reversal logic:
-- When an invoice moves from 'paid' back to any non-paid status,
-- restore stock for product lines and log a compensating inventory movement.

CREATE OR REPLACE FUNCTION public.handle_invoice_reversal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN

    -- Restore stock for product services on this invoice
    UPDATE public.services s
    SET stock_quantity = s.stock_quantity + ii.quantity
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id
      AND ii.service_id = s.id
      AND s.type = 'product';

    -- Log reversal movements (stock coming back in)
    INSERT INTO public.inventory_movements (product_id, quantity, type, source, reference_id)
    SELECT 
      ii.service_id,
      ii.quantity,
      'in',
      'invoice_reversal',
      NEW.id
    FROM public.invoice_items ii
    JOIN public.services s ON s.id = ii.service_id
    WHERE ii.invoice_id = NEW.id
      AND s.type = 'product';

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_handle_invoice_reversal ON public.invoices;

CREATE TRIGGER tr_handle_invoice_reversal
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_invoice_reversal();

