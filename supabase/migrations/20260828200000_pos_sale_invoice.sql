-- Optional tax-invoice copy of a settled POS sale.
-- POS checkout does not create invoices. Convert is opt-in (Customer requests invoice).
-- Money stays on pos_sales_events. Stock already moved with source=pos; skip invoice inventory triggers.

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'invoices missing — cannot add pos_sale_event_id';
  END IF;
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE EXCEPTION 'pos_sales_events missing. Run scripts/apply-pos-integrations.sql first.';
  END IF;
END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pos_sale_event_id uuid;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_pos_sale_event_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_pos_sale_event_id_fkey
      FOREIGN KEY (pos_sale_event_id) REFERENCES public.pos_sales_events(id) ON DELETE SET NULL
  $c$;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_pos_sale_event_id
  ON public.invoices (pos_sale_event_id)
  WHERE pos_sale_event_id IS NOT NULL;

ALTER TABLE public.pos_sales_events
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_invoice_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL
  $c$;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_sales_events_invoice_id
  ON public.pos_sales_events (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.pos_sale_event_id IS
  'Optional tax-invoice copy of a settled POS sale. Not a new receivable. Money stays on pos_sales_events; do not insert invoice payments.';

COMMENT ON COLUMN public.pos_sales_events.invoice_id IS
  'Optional invoices.id when the customer requested a tax invoice for this till sale.';

CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r RECORD;
  v_current_stock integer;
  v_qty integer;
  v_delta integer;
BEGIN
  -- POS already decremented stock via adjust_inventory_stock (source=pos).
  IF NEW.pos_sale_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN

    FOR r IN
      SELECT ii.service_id AS product_id, ii.quantity AS qty
      FROM public.invoice_items ii
      JOIN public.services s ON s.id = ii.service_id
      WHERE ii.invoice_id = NEW.id
        AND COALESCE(s.item_type, 'service') = 'product'
    LOOP
      SELECT stock_quantity INTO v_current_stock
      FROM public.services
      WHERE id = r.product_id
        AND org_id = NEW.org_id
      FOR UPDATE;

      v_qty := GREATEST(COALESCE(r.qty, 0)::integer, 0);
      v_delta := -LEAST(v_qty, COALESCE(v_current_stock, 0));

      IF v_delta <> 0 THEN
        PERFORM public.apply_inventory_movement(
          r.product_id, NEW.org_id, v_delta, 'out', 'invoice', NEW.id
        );
      END IF;
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_invoice_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r RECORD;
  v_qty integer;
BEGIN
  IF NEW.pos_sale_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN

    FOR r IN
      SELECT ii.service_id AS product_id, ii.quantity AS qty
      FROM public.invoice_items ii
      JOIN public.services s ON s.id = ii.service_id
      WHERE ii.invoice_id = NEW.id
        AND COALESCE(s.item_type, 'service') = 'product'
    LOOP
      v_qty := GREATEST(COALESCE(r.qty, 0)::integer, 0);
      IF v_qty <> 0 THEN
        PERFORM public.apply_inventory_movement(
          r.product_id, NEW.org_id, v_qty, 'in', 'invoice_reversal', NEW.id
        );
      END IF;
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$;
