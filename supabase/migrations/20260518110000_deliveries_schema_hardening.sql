-- Deliveries schema hardening (three issues from inventory audit):
--
-- 1. created_by_id: was text (Base44 legacy); code writes auth.uid() which is uuid.
--    Storing a uuid-formatted string in text works but the column type should match.
--    RLS policy already casts auth.uid() to text for comparison — update to compare
--    uuid directly after this change.
--
-- 2. org_id: deliveries have no direct org column; RLS depends entirely on the
--    product_id → services FK join. Add a denormalized org_id for explicit isolation
--    and faster queries.
--
-- 3. quantity: numeric (Base44 legacy), should be integer to match inventory_movements.

-- ============================================================
-- 1. created_by_id text → uuid
-- ============================================================

-- Must drop the "users own deliveries_v2" policy before altering the column,
-- because it references deliveries.created_by_id in a USING expression.
DROP POLICY IF EXISTS "users own deliveries_v2" ON public.deliveries;

ALTER TABLE public.deliveries
  ALTER COLUMN created_by_id TYPE uuid
    USING CASE
      WHEN created_by_id IS NULL THEN NULL
      WHEN created_by_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN created_by_id::uuid
      ELSE NULL
    END;

-- ============================================================
-- 2. org_id column (denormalized from services via product FK)
-- ============================================================

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill existing rows from their linked product's org
UPDATE public.deliveries d
  SET org_id = s.org_id
  FROM public.services s
  WHERE s.id = d.product_id
    AND d.org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_org_id ON public.deliveries(org_id);

-- ============================================================
-- 3. quantity numeric → integer
-- ============================================================

ALTER TABLE public.deliveries
  ALTER COLUMN quantity TYPE integer USING COALESCE(quantity::integer, 0);

-- ============================================================
-- Restore RLS policy using updated column types
-- ============================================================

CREATE POLICY "users own deliveries_v2" ON public.deliveries
  FOR ALL
  USING (
    deliveries.created_by_id = (SELECT auth.uid())
    OR (
      deliveries.org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = deliveries.org_id
          AND m.user_id = (SELECT auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.services s
      JOIN public.memberships m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
      WHERE s.id = deliveries.product_id
    )
  )
  WITH CHECK (
    deliveries.created_by_id = (SELECT auth.uid())
    OR (
      deliveries.org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = deliveries.org_id
          AND m.user_id = (SELECT auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.services s
      JOIN public.memberships m ON m.org_id = s.org_id AND m.user_id = (SELECT auth.uid())
      WHERE s.id = deliveries.product_id
    )
  );
