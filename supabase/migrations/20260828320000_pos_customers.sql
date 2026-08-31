-- POS customers: same public.clients SoR, not a second CRM table.
-- POS-only staff may SELECT/INSERT only rows with pos_enabled = true.
-- Owners/admins keep full dashboard access via existing org member policies.
-- Till checkout must not enumerate the general Paidly client list.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.pos_enabled IS
  'When true, this client is a POS customer (created on the till or explicitly enabled). POS-only staff may only see these rows.';

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NOT NULL THEN
    UPDATE public.clients c
    SET pos_enabled = true
    WHERE c.pos_enabled IS NOT TRUE
      AND EXISTS (
        SELECT 1
        FROM public.pos_sales_events e
        WHERE e.client_id = c.id
          AND e.org_id = c.org_id
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_org_pos_enabled
  ON public.clients (org_id, name)
  WHERE pos_enabled = true;

CREATE OR REPLACE FUNCTION public.enforce_pos_customer_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_pos_only_staff() THEN
    NEW.pos_enabled := true;
    NEW.internal_notes := NULL;
    NEW.notes := NULL;
    NEW.tax_id := NULL;
    NEW.fax := NULL;
    NEW.alternate_email := NULL;
    NEW.website := NULL;
    NEW.address := NULL;
    NEW.industry := NULL;
    NEW.contact_person := NULL;
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_id := COALESCE(NEW.created_by_id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_pos_customer_write() IS
  'POS-only cashiers can only write POS customer rows (name/phone/email). CRM fields stay empty.';

DROP TRIGGER IF EXISTS trg_enforce_pos_customer_write ON public.clients;
CREATE TRIGGER trg_enforce_pos_customer_write
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pos_customer_write();

DROP POLICY IF EXISTS "pos staff select clients for checkout" ON public.clients;
DROP POLICY IF EXISTS "pos staff select pos customers" ON public.clients;
DROP POLICY IF EXISTS "pos staff insert pos customers" ON public.clients;
DROP POLICY IF EXISTS "pos staff update own pos customers" ON public.clients;

CREATE POLICY "pos staff select pos customers"
  ON public.clients
  FOR SELECT
  USING (
    public.is_pos_only_staff()
    AND clients.pos_enabled = true
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "pos staff insert pos customers"
  ON public.clients
  FOR INSERT
  WITH CHECK (
    public.is_pos_only_staff()
    AND clients.pos_enabled = true
    AND COALESCE(clients.created_by_id, auth.uid()) = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "pos staff update own pos customers"
  ON public.clients
  FOR UPDATE
  USING (
    public.is_pos_only_staff()
    AND clients.pos_enabled = true
    AND clients.created_by_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_pos_only_staff()
    AND clients.pos_enabled = true
    AND clients.created_by_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = clients.org_id AND m.user_id = auth.uid()
    )
  );
