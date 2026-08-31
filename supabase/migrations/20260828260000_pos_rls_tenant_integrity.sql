-- POS tenancy: org-scoped RLS, brand/staff/register integrity, client cannot write the till ledger.
-- Money writes stay on the API (service_role). SELECT stays org-member so Cash Flow / Reports can read.
-- Requires 20260828180000_payment_intents.sql and 20260828250000_pos_audit_trail.sql.
-- Tables that are not present yet are skipped (REVOKE / policy / trigger) so this file still applies.

-- ── Permission helper (mirrors server/src/companyRouteAccess.js POS grants) ────
CREATE OR REPLACE FUNCTION public.org_has_pos_permission(target_org_id uuid, permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_org_id IS NULL OR permission IS NULL OR btrim(permission) = '' THEN
    RETURN false;
  END IF;

  IF public.is_company_admin_for_org(target_org_id) THEN
    RETURN permission IN (
      'pos_access',
      'pos_sell',
      'pos_discount',
      'pos_refund',
      'pos_close_register',
      'pos_view_reports'
    );
  END IF;

  IF public.is_company_manager_for_org(target_org_id) THEN
    RETURN permission IN (
      'pos_access',
      'pos_sell',
      'pos_discount',
      'pos_refund',
      'pos_close_register',
      'pos_view_reports'
    );
  END IF;

  IF public.is_org_member(target_org_id) THEN
    RETURN permission IN ('pos_access', 'pos_sell');
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.org_has_pos_permission(uuid, text) IS
  'Org RBAC for POS. Admin/manager/owner: all till grants. Employee member: pos_access + pos_sell. No second POS role table.';

GRANT EXECUTE ON FUNCTION public.org_has_pos_permission(uuid, text) TO authenticated;

-- ── Client cannot write till money or shifts (API uses service_role) ───────────
DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE EXCEPTION 'pos_sales_events missing. Run scripts/apply-pos-integrations.sql first.';
  END IF;
END $$;

GRANT SELECT ON TABLE public.pos_sales_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pos_sales_events FROM authenticated, anon;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_audit_events',
    'payment_intents',
    'pos_register_sessions',
    'pos_registers',
    'pos_connections'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% missing — skip write REVOKE; apply the matching 20260828 POS migration then re-run this file', t;
    ELSE
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated, anon', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.pos_register_sessions') IS NULL THEN
    RAISE NOTICE 'pos_register_sessions missing — apply 20260828220000_pos_register_sessions.sql';
  ELSE
    EXECUTE 'GRANT SELECT ON TABLE public.pos_register_sessions TO authenticated';
  END IF;
  IF to_regclass('public.pos_registers') IS NULL THEN
    RAISE NOTICE 'pos_registers missing — apply 20260828210000_pos_registers.sql';
  ELSE
    EXECUTE 'GRANT SELECT ON TABLE public.pos_registers TO authenticated';
  END IF;
END $$;

-- ── RLS: org member SELECT; writes only where a policy remains (admin connections) ─
DROP POLICY IF EXISTS "pos_sales_events_org_select" ON public.pos_sales_events;
CREATE POLICY "pos_sales_events_org_select"
  ON public.pos_sales_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DO $$
BEGIN
  IF to_regclass('public.pos_audit_events') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "pos_audit_events_org_select" ON public.pos_audit_events';
  EXECUTE $p$
    CREATE POLICY "pos_audit_events_org_select"
      ON public.pos_audit_events
      FOR SELECT
      TO authenticated
      USING (public.is_org_member(org_id))
  $p$;
END $$;

DO $$
BEGIN
  IF to_regclass('public.pos_register_sessions') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "pos_register_sessions_org_select" ON public.pos_register_sessions';
  EXECUTE $p$
    CREATE POLICY "pos_register_sessions_org_select"
      ON public.pos_register_sessions
      FOR SELECT
      TO authenticated
      USING (public.is_org_member(org_id))
  $p$;
  EXECUTE 'DROP POLICY IF EXISTS "pos_register_sessions_org_write" ON public.pos_register_sessions';
  EXECUTE 'DROP POLICY IF EXISTS "pos_register_sessions_org_update" ON public.pos_register_sessions';
END $$;

DO $$
BEGIN
  IF to_regclass('public.pos_registers') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "pos_registers_org_select" ON public.pos_registers';
  EXECUTE $p$
    CREATE POLICY "pos_registers_org_select"
      ON public.pos_registers
      FOR SELECT
      TO authenticated
      USING (public.is_org_member(org_id))
  $p$;
  EXECUTE 'DROP POLICY IF EXISTS "pos_registers_org_manage" ON public.pos_registers';
END $$;

DO $$
BEGIN
  IF to_regclass('public.pos_connections') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "pos_connections_org_select" ON public.pos_connections';
  EXECUTE $p$
    CREATE POLICY "pos_connections_org_select"
      ON public.pos_connections
      FOR SELECT
      TO authenticated
      USING (public.is_org_member(org_id))
  $p$;
  EXECUTE 'DROP POLICY IF EXISTS "pos_connections_org_manage" ON public.pos_connections';
END $$;

-- ── Integrity: brand, staff, register, sale FKs must stay inside the org ───────
CREATE OR REPLACE FUNCTION public.pos_register_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS register brand must belong to the organization';
  END IF;

  IF NEW.assigned_staff_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.memberships m
       WHERE m.org_id = NEW.org_id AND m.user_id = NEW.assigned_staff_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = NEW.org_id AND o.owner_id = NEW.assigned_staff_id
     )
  THEN
    RAISE EXCEPTION 'POS register staff must belong to the organization';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pos_registers') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tr_pos_register_org_integrity ON public.pos_registers';
  EXECUTE $t$
    CREATE TRIGGER tr_pos_register_org_integrity
    BEFORE INSERT OR UPDATE ON public.pos_registers
    FOR EACH ROW
    EXECUTE FUNCTION public.pos_register_org_integrity()
  $t$;
END $$;

CREATE OR REPLACE FUNCTION public.pos_session_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_registers r
    WHERE r.id = NEW.register_id AND r.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS session register must belong to the organization';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pos_register_sessions') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tr_pos_session_org_integrity ON public.pos_register_sessions';
  EXECUTE $t$
    CREATE TRIGGER tr_pos_session_org_integrity
    BEFORE INSERT OR UPDATE ON public.pos_register_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.pos_session_org_integrity()
  $t$;
END $$;

CREATE OR REPLACE FUNCTION public.pos_sale_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_connections c
    WHERE c.id = NEW.connection_id AND c.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS sale connection must belong to the organization';
  END IF;

  IF NEW.register_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_registers r
    WHERE r.id = NEW.register_id AND r.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS sale register must belong to the organization';
  END IF;

  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_register_sessions s
    WHERE s.id = NEW.session_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS sale session must belong to the organization';
  END IF;

  IF NEW.parent_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_sales_events p
    WHERE p.id = NEW.parent_event_id AND p.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS return must reference a sale in the same organization';
  END IF;

  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS sale brand must belong to the organization';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = NEW.client_id AND cl.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS sale customer must belong to the organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_pos_sale_org_integrity ON public.pos_sales_events;
CREATE TRIGGER tr_pos_sale_org_integrity
BEFORE INSERT OR UPDATE ON public.pos_sales_events
FOR EACH ROW
EXECUTE FUNCTION public.pos_sale_org_integrity();

CREATE OR REPLACE FUNCTION public.pos_audit_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.sale_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_sales_events s
    WHERE s.id = NEW.sale_event_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS audit sale must belong to the organization';
  END IF;

  IF NEW.payment_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_intents i
    WHERE i.id = NEW.payment_intent_id AND i.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'POS audit payment intent must belong to the organization';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.pos_audit_events') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tr_pos_audit_org_integrity ON public.pos_audit_events';
  EXECUTE $t$
    CREATE TRIGGER tr_pos_audit_org_integrity
    BEFORE INSERT OR UPDATE ON public.pos_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION public.pos_audit_org_integrity()
  $t$;
END $$;

CREATE OR REPLACE FUNCTION public.payment_intent_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Payment intent brand must belong to the organization';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = NEW.client_id AND cl.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Payment intent customer must belong to the organization';
  END IF;

  IF NEW.pos_sale_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_sales_events s
    WHERE s.id = NEW.pos_sale_event_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Payment intent POS sale must belong to the organization';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NULL THEN
    RAISE NOTICE 'payment_intents missing — apply 20260828180000_payment_intents.sql then re-run this file';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS tr_payment_intent_org_integrity ON public.payment_intents';
  EXECUTE $t$
    CREATE TRIGGER tr_payment_intent_org_integrity
    BEFORE INSERT OR UPDATE ON public.payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION public.payment_intent_org_integrity()
  $t$;
END $$;

COMMENT ON TABLE public.pos_sales_events IS
  'Normalized POS sale events. Org-scoped. Clients SELECT only; the API writes after server-priced checkout.';

NOTIFY pgrst, 'reload schema';
