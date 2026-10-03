-- Same-email employee + personal business: two leftovers from the tenant-isolation work
-- (reproduced in tests/unit/sameEmailPersonalBusiness.db.test.js).
--
-- 1. The product/service catalog was readable (and writable) by every non-POS member and readable by till
--    cashiers, so an employee saw the employer's products, prices, cost prices and stock. The till does not
--    need it: POS reads the catalog through the server (/api/pos/catalog behind requirePosPermission), and
--    stock moves on payment run server-side (an invoice becomes paid only through recorded payments).
--    Catalog, stock movements and stock deliveries are now for the business's owner/admin/manager.
--
-- 2. A row could be moved into another business by rewriting org_id. UPDATE needs USING from one permissive
--    policy and WITH CHECK from any permissive policy — e.g. owner of Business B (USING) + till-customer
--    policy in employer A (CHECK) moved B's clients into A. Signed-in users can no longer change an existing
--    row's org_id on any org-scoped table. Server code (service_role) and SECURITY DEFINER functions are
--    unaffected.

-- ---------------------------------------------------------------------------------------------------
-- Catalog: owner / admin / manager of THAT business (platform admins keep their existing policy)
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select services" ON public.services;
DROP POLICY IF EXISTS "org members write services" ON public.services;
DROP POLICY IF EXISTS "org managers select services" ON public.services;
CREATE POLICY "org managers select services" ON public.services
  FOR SELECT USING (public.can_view_org_financials(org_id));
DROP POLICY IF EXISTS "org managers write services" ON public.services;
CREATE POLICY "org managers write services" ON public.services
  FOR ALL
  USING (public.can_view_org_financials(org_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_view_org_financials(org_id));

DROP POLICY IF EXISTS "org members select inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "org members insert inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "org managers select inventory_movements" ON public.inventory_movements;
CREATE POLICY "org managers select inventory_movements" ON public.inventory_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = inventory_movements.product_id AND public.can_view_org_financials(s.org_id)
    )
  );
DROP POLICY IF EXISTS "org managers insert inventory_movements" ON public.inventory_movements;
CREATE POLICY "org managers insert inventory_movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = inventory_movements.product_id AND public.can_view_org_financials(s.org_id)
    )
  );

-- deliveries.org_id comes from 20260518110000_deliveries_schema_hardening.sql, which not every database
-- has (production reported "42703: column org_id does not exist"); without it a delivery is scoped
-- through its product (services.org_id) only.
DO $$
DECLARE
  v_has_org boolean;
  v_rule text;
  v_pol record;
BEGIN
  IF to_regclass('public.deliveries') IS NULL THEN
    RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'org_id'
  ) INTO v_has_org;

  -- ::text on both sides: product_id is uuid after 20260327120000 but text on databases that missed it.
  v_rule := 'EXISTS (SELECT 1 FROM public.services s '
    || 'WHERE s.id::text = deliveries.product_id::text AND public.can_view_org_financials(s.org_id))';
  IF v_has_org THEN
    v_rule := '(deliveries.org_id IS NOT NULL AND public.can_view_org_financials(deliveries.org_id)) OR ' || v_rule;
  END IF;

  -- Exact end state even on a database that drifted from the migrations: any permissive policy other
  -- than the platform-admin one would OR with (and void) the rule below.
  FOR v_pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deliveries'
      AND policyname <> 'admin full access deliveries_v2'
  LOOP
    RAISE NOTICE 'deliveries: dropping policy %', v_pol.policyname;
    EXECUTE format('DROP POLICY %I ON public.deliveries', v_pol.policyname);
  END LOOP;
  EXECUTE format(
    'CREATE POLICY "org managers manage deliveries" ON public.deliveries FOR ALL USING (%s) WITH CHECK (%s)',
    v_rule, v_rule
  );
END $$;

-- ---------------------------------------------------------------------------------------------------
-- No cross-business moves by signed-in users
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_client_org_move()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Runs as the caller: authenticated/anon are browser requests; service_role, the owner and
  -- SECURITY DEFINER functions (current_user = owner) are trusted server paths.
  IF current_user IN ('authenticated', 'anon')
     AND OLD.org_id IS NOT NULL
     AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'A record cannot be moved to another business.'
      USING ERRCODE = '42501', HINT = 'ORG_MOVE_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_client_org_move() IS
  'BEFORE UPDATE OF org_id guard: browser roles cannot re-home a row into another business.';

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND a.atttypid = 'uuid'::regtype
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_client_org_move ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE TRIGGER trg_prevent_client_org_move BEFORE UPDATE OF org_id ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.prevent_client_org_move()',
      t.tablename
    );
  END LOOP;
END $$;

-- The trigger runs as the caller, so authenticated must be able to execute it. The body is the guard:
-- a same-business update returns NEW; only a real org_id change from the browser is rejected.
GRANT EXECUTE ON FUNCTION public.prevent_client_org_move() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
