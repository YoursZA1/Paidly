-- Repair apply_inventory_movement for databases that already applied the
-- incomplete 20260804120000 migration (missing search_path — which also
-- wiped the invoice-trigger search_path from 20260325230000 — missing
-- GRANT on apply_inventory_movement, no type/delta sign check).
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_product_id uuid,
  p_org_id uuid,
  p_delta integer,
  p_type text,
  p_source text DEFAULT 'manual',
  p_reference_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stock integer;
  v_type text;
BEGIN
  IF p_product_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'product_id and org_id are required';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'delta must be non-zero';
  END IF;

  v_type := lower(trim(COALESCE(p_type, '')));
  IF v_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'type must be in/out';
  END IF;

  IF (v_type = 'in' AND p_delta < 0) OR (v_type = 'out' AND p_delta > 0) THEN
    RAISE EXCEPTION 'type must match delta sign (in=positive, out=negative)';
  END IF;

  UPDATE public.services s
  SET
    stock_quantity = s.stock_quantity + p_delta,
    updated_at = now()
  WHERE s.id = p_product_id
    AND s.org_id = p_org_id
    AND COALESCE(s.item_type, 'service') = 'product'
    AND (p_delta > 0 OR (s.stock_quantity + p_delta) >= 0)
  RETURNING s.stock_quantity INTO v_stock;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'stock update failed (missing product/org or insufficient stock)';
  END IF;

  INSERT INTO public.inventory_movements (
    product_id,
    quantity,
    type,
    source,
    reference_id,
    created_at
  )
  VALUES (
    p_product_id,
    ABS(p_delta),
    v_type,
    COALESCE(NULLIF(trim(p_source), ''), 'manual'),
    p_reference_id,
    now()
  );

  RETURN v_stock;
END;
$$;

COMMENT ON FUNCTION public.apply_inventory_movement(uuid, uuid, integer, text, text, uuid) IS
  'Single atomic implementation of "apply a stock delta + log a movement". Used by adjust_inventory_stock (manual), POS, PO receive, and the invoice paid/reversal triggers. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid, uuid, integer, text, text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id uuid,
  p_org_id uuid,
  p_delta integer,
  p_type text,
  p_source text DEFAULT 'manual',
  p_reference_id uuid DEFAULT NULL
)
RETURNS TABLE(new_stock integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY SELECT public.apply_inventory_movement(
    p_product_id, p_org_id, p_delta, p_type, p_source, p_reference_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text, text, uuid)
  TO authenticated, service_role;

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

DROP TRIGGER IF EXISTS tr_handle_invoice_paid ON public.invoices;
CREATE TRIGGER tr_handle_invoice_paid
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_invoice_paid();

DROP TRIGGER IF EXISTS tr_handle_invoice_reversal ON public.invoices;
CREATE TRIGGER tr_handle_invoice_reversal
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_invoice_reversal();
