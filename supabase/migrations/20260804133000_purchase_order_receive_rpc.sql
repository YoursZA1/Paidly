-- Atomic PO line receipt: updates weighted-average cost, applies the stock
-- movement via apply_inventory_movement (Track A's shared function), marks
-- the line received, and flips the PO to 'received' once every line is
-- fully received.

CREATE OR REPLACE FUNCTION public.receive_purchase_order_item(
  p_po_item_id uuid,
  p_org_id uuid,
  p_quantity_received integer,
  p_unit_cost numeric
)
RETURNS TABLE(new_stock integer, new_cost_price numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_po_id uuid;
  v_current_stock integer;
  v_current_cost numeric;
  v_new_cost numeric;
  v_remaining_lines integer;
BEGIN
  IF p_po_item_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'po_item_id and org_id are required';
  END IF;

  IF p_quantity_received IS NULL OR p_quantity_received <= 0 THEN
    RAISE EXCEPTION 'quantity_received must be positive';
  END IF;

  SELECT poi.*, po.id AS purchase_order_id
  INTO v_item
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = p_po_item_id
    AND poi.org_id = p_org_id
    AND po.status = 'approved'
  FOR UPDATE OF poi;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'purchase order item not found, not in this org, or PO is not approved';
  END IF;

  IF v_item.quantity_received + p_quantity_received > v_item.quantity_ordered THEN
    RAISE EXCEPTION 'cannot receive % units: only % remaining on this line',
      p_quantity_received, (v_item.quantity_ordered - v_item.quantity_received);
  END IF;

  v_po_id := v_item.purchase_order_id;

  SELECT stock_quantity, COALESCE(cost_price, 0)
  INTO v_current_stock, v_current_cost
  FROM public.services
  WHERE id = v_item.product_id AND org_id = p_org_id
  FOR UPDATE;

  -- Weighted-average cost across existing stock and this receipt.
  IF (v_current_stock + p_quantity_received) > 0 THEN
    v_new_cost := ROUND(
      ((v_current_stock * v_current_cost) + (p_quantity_received * p_unit_cost))
      / (v_current_stock + p_quantity_received),
      2
    );
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  UPDATE public.services
  SET cost_price = v_new_cost, updated_at = now()
  WHERE id = v_item.product_id AND org_id = p_org_id;

  new_stock := public.apply_inventory_movement(
    v_item.product_id, p_org_id, p_quantity_received, 'in', 'purchase_order', v_po_id
  );
  new_cost_price := v_new_cost;

  UPDATE public.purchase_order_items
  SET quantity_received = quantity_received + p_quantity_received,
      updated_at = now()
  WHERE id = p_po_item_id;

  SELECT count(*) INTO v_remaining_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = v_po_id
    AND quantity_received < quantity_ordered;

  IF v_remaining_lines = 0 THEN
    UPDATE public.purchase_orders
    SET status = 'received', received_at = now(), updated_at = now()
    WHERE id = v_po_id;
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order_item(uuid, uuid, integer, numeric) TO authenticated;

COMMENT ON FUNCTION public.receive_purchase_order_item IS
  'Atomically receives a PO line: weighted-average cost update, stock movement via apply_inventory_movement, line/PO status update. SECURITY INVOKER (runs under caller RLS).';
