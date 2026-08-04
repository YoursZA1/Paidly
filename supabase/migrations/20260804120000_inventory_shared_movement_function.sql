-- Consolidate all stock-mutating paths onto one atomic function.
--
-- Previously, adjust_inventory_stock() (manual adjustments) and the
-- handle_invoice_paid()/handle_invoice_reversal() triggers each implemented
-- their own "update stock_quantity + log a movement" logic independently,
-- with the trigger versions doing it as two separate set-based statements
-- instead of one atomic per-row operation. apply_inventory_movement()
-- becomes the single implementation; everything else calls it.

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
AS $$
DECLARE
  v_stock integer;
BEGIN
  IF p_product_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'product_id and org_id are required';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'delta must be non-zero';
  END IF;

  IF p_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'type must be in/out';
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
    p_type,
    COALESCE(NULLIF(trim(p_source), ''), 'manual'),
    p_reference_id,
    now()
  );

  RETURN v_stock;
END;
$$;

COMMENT ON FUNCTION public.apply_inventory_movement IS
  'Single atomic implementation of "apply a stock delta + log a movement". Used by adjust_inventory_stock (manual) and the invoice paid/reversal triggers.';

-- adjust_inventory_stock keeps its existing signature/callers; it now just
-- delegates to apply_inventory_movement.
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
AS $$
BEGIN
  RETURN QUERY SELECT public.apply_inventory_movement(
    p_product_id, p_org_id, p_delta, p_type, p_source, p_reference_id
  );
END;
$$;

-- Invoice paid: deduct stock per line item via apply_inventory_movement,
-- clamping each row's delta to available stock (same "never go below zero,
-- never block the payment" behavior as before) instead of the previous
-- two-statement set-based UPDATE. FOR UPDATE serializes the rare case of
-- the same product appearing on multiple line items of one invoice.
CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
  v_current_stock integer;
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
      FOR UPDATE;

      v_delta := -LEAST(r.qty, COALESCE(v_current_stock, 0));

      IF v_delta <> 0 THEN
        PERFORM public.apply_inventory_movement(
          r.product_id, NEW.org_id, v_delta, 'out', 'invoice', NEW.id
        );
      END IF;
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Invoice reversal: restore stock per line item via apply_inventory_movement.
-- Same restore-the-full-line-quantity semantics as before (a pre-existing,
-- unchanged limitation: if the original deduction was clamped by low stock,
-- reversal can over-restore beyond the original balance).
CREATE OR REPLACE FUNCTION public.handle_invoice_reversal()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN

    FOR r IN
      SELECT ii.service_id AS product_id, ii.quantity AS qty
      FROM public.invoice_items ii
      JOIN public.services s ON s.id = ii.service_id
      WHERE ii.invoice_id = NEW.id
        AND COALESCE(s.item_type, 'service') = 'product'
    LOOP
      PERFORM public.apply_inventory_movement(
        r.product_id, NEW.org_id, r.qty, 'in', 'invoice_reversal', NEW.id
      );
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
