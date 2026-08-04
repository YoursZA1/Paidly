-- Read-only reconciliation helper: compares services.stock_quantity (the
-- maintained cache) against the balance implied by inventory_movements (the
-- ledger). Does not auto-correct anything — for ops/admin verification and
-- to surface any drift left over from write paths that predate the
-- apply_inventory_movement consolidation.

CREATE OR REPLACE FUNCTION public.reconcile_product_stock(
  p_product_id uuid,
  p_org_id uuid
)
RETURNS TABLE(
  ledger_balance integer,
  stored_balance integer,
  drift integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(
      CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END
    ), 0)::integer AS ledger_balance,
    s.stock_quantity AS stored_balance,
    (s.stock_quantity - COALESCE(SUM(
      CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END
    ), 0))::integer AS drift
  FROM public.services s
  LEFT JOIN public.inventory_movements im ON im.product_id = s.id
  WHERE s.id = p_product_id
    AND s.org_id = p_org_id
  GROUP BY s.stock_quantity;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_product_stock(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reconcile_product_stock IS
  'Read-only: compares services.stock_quantity against the balance implied by inventory_movements for one product. Does not correct drift.';
