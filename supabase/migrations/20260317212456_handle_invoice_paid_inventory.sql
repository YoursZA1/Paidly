-- Stock deduction engine: only when invoices transition to 'paid'

-- Ensure invoice_items has a foreign key to services for products
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS service_id uuid references public.services(id);

CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run when status changes to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN

    -- Record inventory movements for products on this invoice
    INSERT INTO public.inventory_movements (product_id, quantity, type, source, reference_id)
    SELECT 
      ii.service_id,
      ii.quantity,
      'out',
      'invoice',
      NEW.id
    FROM public.invoice_items ii
    JOIN public.services s ON s.id = ii.service_id
    WHERE ii.invoice_id = NEW.id
      AND s.type = 'product';

    -- Deduct stock from product services, never below zero
    UPDATE public.services s
    SET stock_quantity = GREATEST(0, s.stock_quantity - ii.quantity)
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id
      AND ii.service_id = s.id
      AND s.type = 'product';

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: fire after invoice status updates
DROP TRIGGER IF EXISTS tr_handle_invoice_paid ON public.invoices;

CREATE TRIGGER tr_handle_invoice_paid
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_invoice_paid();

