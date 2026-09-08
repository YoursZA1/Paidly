-- Commercial line quantities are numeric(12,2) (1.25 hours / kg is valid).
-- Inventory, deliveries, and PO lines were integer, so PostgREST writes of
-- 1.25 failed with: invalid input syntax for type integer: "1.25"
-- Do not truncate 1.25 to 1 — keep the same scale as invoice_items.quantity.

-- ── Columns ──────────────────────────────────────────────────────────────────
-- product_stock_only: service rows must keep stock_quantity NULL.
-- Do not COALESCE stock to 0 — that violates the check and rolls the ALTER back.

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS product_stock_only;

ALTER TABLE public.services
  ALTER COLUMN stock_quantity DROP NOT NULL;

ALTER TABLE public.services
  ALTER COLUMN stock_quantity TYPE numeric(12,2)
  USING stock_quantity::numeric(12,2);

ALTER TABLE public.services
  ALTER COLUMN stock_quantity DROP DEFAULT;

UPDATE public.services
SET type = CASE
  WHEN COALESCE(item_type, 'service') = 'product' THEN 'product'
  ELSE 'service'
END
WHERE type IS NULL OR type NOT IN ('product', 'service');

UPDATE public.services
SET stock_quantity = NULL
WHERE type <> 'product'
  AND stock_quantity IS NOT NULL;

ALTER TABLE public.services
  ADD CONSTRAINT product_stock_only CHECK (
    (type = 'service' AND stock_quantity IS NULL)
    OR
    (type = 'product')
  );

ALTER TABLE public.services
  ALTER COLUMN low_stock_threshold TYPE numeric(12,2)
  USING CASE
    WHEN low_stock_threshold IS NULL THEN NULL
    ELSE low_stock_threshold::numeric(12,2)
  END;

ALTER TABLE public.services
  ALTER COLUMN min_quantity TYPE numeric(12,2)
  USING COALESCE(min_quantity::numeric(12,2), 1);

ALTER TABLE public.services
  ALTER COLUMN min_quantity SET DEFAULT 1;

ALTER TABLE public.inventory_movements
  ALTER COLUMN quantity TYPE numeric(12,2)
  USING COALESCE(quantity::numeric(12,2), 0);

ALTER TABLE public.deliveries
  ALTER COLUMN quantity TYPE numeric(12,2)
  USING COALESCE(quantity::numeric(12,2), 0);

ALTER TABLE public.purchase_order_items
  ALTER COLUMN quantity_ordered TYPE numeric(12,2)
  USING quantity_ordered::numeric(12,2);

ALTER TABLE public.purchase_order_items
  ALTER COLUMN quantity_received TYPE numeric(12,2)
  USING quantity_received::numeric(12,2);

COMMENT ON COLUMN public.services.stock_quantity IS
  'On-hand stock. numeric(12,2) to match invoice_items.quantity (fractional units allowed).';

COMMENT ON COLUMN public.inventory_movements.quantity IS
  'Absolute movement quantity. Same scale as services.stock_quantity.';

-- ── RPCs: argument types change, so drop then recreate ───────────────────────

DROP FUNCTION IF EXISTS public.receive_purchase_order_item(uuid, uuid, integer, numeric);
DROP FUNCTION IF EXISTS public.adjust_inventory_stock(uuid, uuid, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.apply_inventory_movement(uuid, uuid, integer, text, text, uuid);
DROP FUNCTION IF EXISTS public.reconcile_product_stock(uuid, uuid);

CREATE FUNCTION public.apply_inventory_movement(
  p_product_id uuid,
  p_org_id uuid,
  p_delta numeric,
  p_type text,
  p_source text DEFAULT 'manual',
  p_reference_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stock numeric(12,2);
  v_type text;
  v_delta numeric(12,2);
BEGIN
  IF p_product_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'product_id and org_id are required';
  END IF;

  v_delta := ROUND(COALESCE(p_delta, 0), 2);
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'delta must be non-zero';
  END IF;

  v_type := lower(trim(COALESCE(p_type, '')));
  IF v_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'type must be in/out';
  END IF;

  IF (v_type = 'in' AND v_delta < 0) OR (v_type = 'out' AND v_delta > 0) THEN
    RAISE EXCEPTION 'type must match delta sign (in=positive, out=negative)';
  END IF;

  UPDATE public.services s
  SET
    stock_quantity = s.stock_quantity + v_delta,
    updated_at = now()
  WHERE s.id = p_product_id
    AND s.org_id = p_org_id
    AND COALESCE(s.item_type, 'service') = 'product'
    AND (v_delta > 0 OR (s.stock_quantity + v_delta) >= 0)
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
    ABS(v_delta),
    v_type,
    COALESCE(NULLIF(trim(p_source), ''), 'manual'),
    p_reference_id,
    now()
  );

  RETURN v_stock;
END;
$$;

COMMENT ON FUNCTION public.apply_inventory_movement(uuid, uuid, numeric, text, text, uuid) IS
  'Apply a stock delta and log a movement. Delta is numeric(12,2) — same scale as invoice line quantity.';

GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid, uuid, numeric, text, text, uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.adjust_inventory_stock(
  p_product_id uuid,
  p_org_id uuid,
  p_delta numeric,
  p_type text,
  p_source text DEFAULT 'manual',
  p_reference_id uuid DEFAULT NULL
)
RETURNS TABLE(new_stock numeric)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY SELECT public.apply_inventory_movement(
    p_product_id, p_org_id, p_delta, p_type, p_source, p_reference_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, numeric, text, text, uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.receive_purchase_order_item(
  p_po_item_id uuid,
  p_org_id uuid,
  p_quantity_received numeric,
  p_unit_cost numeric
)
RETURNS TABLE(new_stock numeric, new_cost_price numeric)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item RECORD;
  v_po_id uuid;
  v_current_stock numeric;
  v_current_cost numeric;
  v_new_cost numeric;
  v_remaining_lines integer;
  v_qty numeric(12,2);
BEGIN
  IF p_po_item_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'po_item_id and org_id are required';
  END IF;

  v_qty := ROUND(COALESCE(p_quantity_received, 0), 2);
  IF v_qty <= 0 THEN
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

  IF v_item.quantity_received + v_qty > v_item.quantity_ordered THEN
    RAISE EXCEPTION 'cannot receive % units: only % remaining on this line',
      v_qty, (v_item.quantity_ordered - v_item.quantity_received);
  END IF;

  v_po_id := v_item.purchase_order_id;

  SELECT stock_quantity, COALESCE(cost_price, 0)
  INTO v_current_stock, v_current_cost
  FROM public.services
  WHERE id = v_item.product_id AND org_id = p_org_id
  FOR UPDATE;

  IF (COALESCE(v_current_stock, 0) + v_qty) > 0 THEN
    v_new_cost := ROUND(
      ((COALESCE(v_current_stock, 0) * v_current_cost) + (v_qty * p_unit_cost))
      / (COALESCE(v_current_stock, 0) + v_qty),
      2
    );
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  UPDATE public.services
  SET cost_price = v_new_cost, updated_at = now()
  WHERE id = v_item.product_id AND org_id = p_org_id;

  new_stock := public.apply_inventory_movement(
    v_item.product_id, p_org_id, v_qty, 'in', 'purchase_order', v_po_id
  );
  new_cost_price := v_new_cost;

  UPDATE public.purchase_order_items
  SET quantity_received = quantity_received + v_qty,
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

GRANT EXECUTE ON FUNCTION public.receive_purchase_order_item(uuid, uuid, numeric, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.receive_purchase_order_item IS
  'Receives a PO line with numeric quantity (same scale as invoice line items).';

CREATE FUNCTION public.reconcile_product_stock(
  p_product_id uuid,
  p_org_id uuid
)
RETURNS TABLE(
  ledger_balance numeric,
  stored_balance numeric,
  drift numeric
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(SUM(
      CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END
    ), 0)::numeric(12,2) AS ledger_balance,
    s.stock_quantity AS stored_balance,
    (s.stock_quantity - COALESCE(SUM(
      CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END
    ), 0))::numeric(12,2) AS drift
  FROM public.services s
  LEFT JOIN public.inventory_movements im ON im.product_id = s.id
  WHERE s.id = p_product_id
    AND s.org_id = p_org_id
  GROUP BY s.stock_quantity;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_product_stock(uuid, uuid) TO authenticated;

-- Invoice paid/reversal: keep the line quantity. Do not cast 1.25 to integer.

CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  r RECORD;
  v_current_stock numeric;
  v_qty numeric;
  v_delta numeric;
BEGIN
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

      v_qty := GREATEST(COALESCE(r.qty, 0), 0);
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
  v_qty numeric;
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
      v_qty := GREATEST(COALESCE(r.qty, 0), 0);
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
