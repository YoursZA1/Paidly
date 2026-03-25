-- Inventory UI stores catalog line items in public.services.
-- Original Base44 migration pointed deliveries.product_id at public.products, which breaks inserts.
-- Policies reference deliveries.product_id, so they must be dropped before changing the column type.

-- 1) Remove policies that depend on deliveries.product_id
DROP POLICY IF EXISTS "users own deliveries_v2" ON public.deliveries;
DROP POLICY IF EXISTS "admin full access deliveries_v2" ON public.deliveries;

-- 2) Repoint FK and align product_id with public.services.id (uuid)
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_product_id_fkey;

-- Requires existing rows to hold valid UUID strings (Paidly service ids). Fix or delete bad rows before applying if this fails.
ALTER TABLE public.deliveries
  ALTER COLUMN product_id TYPE uuid USING trim(product_id::text)::uuid;

ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.services(id) ON DELETE CASCADE;

-- 3) Restore RLS (admin first, then members)
CREATE POLICY "admin full access deliveries_v2" ON public.deliveries
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "users own deliveries_v2" ON public.deliveries
  FOR ALL
  USING (
    deliveries.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.services s
      JOIN public.memberships m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
      WHERE s.id = deliveries.product_id
    )
  )
  WITH CHECK (
    deliveries.created_by_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.services s
      JOIN public.memberships m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
      WHERE s.id = deliveries.product_id
    )
  );
