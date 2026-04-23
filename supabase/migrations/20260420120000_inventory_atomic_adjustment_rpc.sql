-- Atomic stock mutation for manual inventory operations.
-- Uses a single transaction scope (function execution) to update stock and write movement.

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

  RETURN QUERY SELECT v_stock;
END;
$$;
