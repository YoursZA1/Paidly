-- inventory_movements: org-scoped RLS aligned with public.services
--
-- The Inventory UI inserts movement rows after updating services.stock_quantity.
-- Without INSERT policies, PostgREST returns 403 even when the user can update services.

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access inventory_movements" ON public.inventory_movements;
CREATE POLICY "admin full access inventory_movements" ON public.inventory_movements
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "org members select inventory_movements" ON public.inventory_movements;
CREATE POLICY "org members select inventory_movements" ON public.inventory_movements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.services s
      INNER JOIN public.memberships m
        ON m.org_id = s.org_id
       AND m.user_id = (SELECT auth.uid())
      WHERE s.id = inventory_movements.product_id
    )
  );

DROP POLICY IF EXISTS "org members insert inventory_movements" ON public.inventory_movements;
CREATE POLICY "org members insert inventory_movements" ON public.inventory_movements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.services s
      INNER JOIN public.memberships m
        ON m.org_id = s.org_id
       AND m.user_id = (SELECT auth.uid())
      WHERE s.id = product_id
    )
  );
