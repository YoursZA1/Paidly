-- Append-only POS audit trail (document_events / subscription_events pattern).
-- Sale SoR stays pos_sales_events. Money fields stay immutable (existing trigger).
-- Deleting a POS connection must not erase completed sales.
-- payment_intents (20260828180000) is preferred. If it is missing, create the audit
-- table without that FK so this file still applies.

ALTER TABLE public.pos_sales_events
  ALTER COLUMN connection_id DROP NOT NULL;

ALTER TABLE public.pos_sales_events
  DROP CONSTRAINT IF EXISTS pos_sales_events_connection_id_fkey;

ALTER TABLE public.pos_sales_events
  ADD CONSTRAINT pos_sales_events_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES public.pos_connections(id) ON DELETE SET NULL;

-- connection_id is hardware linkage, not money identity. Disconnect SET NULLs it.
CREATE OR REPLACE FUNCTION public.pos_sales_event_financial_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.items IS DISTINCT FROM OLD.items
     OR NEW.sale_kind IS DISTINCT FROM OLD.sale_kind
     OR NEW.parent_event_id IS DISTINCT FROM OLD.parent_event_id
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
     OR NEW.amount_tendered IS DISTINCT FROM OLD.amount_tendered
     OR NEW.change_due IS DISTINCT FROM OLD.change_due
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.cashier_id IS DISTINCT FROM OLD.cashier_id
     OR NEW.register_id IS DISTINCT FROM OLD.register_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.original_payment_intent_id IS DISTINCT FROM OLD.original_payment_intent_id
  THEN
    RAISE EXCEPTION 'POS sales cannot change financial fields; record a return instead';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_pos_connection(
  p_org_id uuid,
  p_connection_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted boolean := false;
BEGIN
  IF p_org_id IS NULL OR p_connection_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.pos_sales_events
  SET connection_id = NULL
  WHERE connection_id = p_connection_id
    AND org_id = p_org_id;

  DELETE FROM public.pos_connections
  WHERE id = p_connection_id
    AND org_id = p_org_id
  RETURNING true INTO deleted;

  RETURN COALESCE(deleted, false);
END;
$$;

CREATE TABLE IF NOT EXISTS public.pos_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_event_id uuid REFERENCES public.pos_sales_events(id) ON DELETE CASCADE,
  payment_intent_id uuid,
  event_type text NOT NULL CHECK (
    event_type IN (
      'sale_created',
      'payment',
      'completion',
      'refund',
      'cancellation',
      'inventory_movement'
    )
  ),
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'webhook')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NULL THEN
    RAISE NOTICE 'payment_intents missing — apply 20260828180000_payment_intents.sql then re-run this file for the FK';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pos_audit_events DROP CONSTRAINT IF EXISTS pos_audit_events_payment_intent_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_audit_events
      ADD CONSTRAINT pos_audit_events_payment_intent_id_fkey
      FOREIGN KEY (payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE CASCADE
  $c$;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_audit_events_org_occurred
  ON public.pos_audit_events (org_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_audit_events_sale
  ON public.pos_audit_events (sale_event_id, occurred_at ASC)
  WHERE sale_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_audit_events_intent
  ON public.pos_audit_events (payment_intent_id, occurred_at ASC)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.pos_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_audit_events_org_select" ON public.pos_audit_events;
CREATE POLICY "pos_audit_events_org_select"
  ON public.pos_audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

GRANT ALL ON TABLE public.pos_audit_events TO service_role;
GRANT SELECT ON TABLE public.pos_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_audit_event_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'POS audit events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS tr_pos_audit_event_no_update ON public.pos_audit_events;
CREATE TRIGGER tr_pos_audit_event_no_update
BEFORE UPDATE ON public.pos_audit_events
FOR EACH ROW
EXECUTE FUNCTION public.pos_audit_event_append_only();

COMMENT ON TABLE public.pos_audit_events IS
  'Append-only till lifecycle: sale_created, payment, completion, refund, cancellation, inventory_movement. Not a second sales ledger.';

COMMENT ON COLUMN public.pos_sales_events.connection_id IS
  'POS connection that ingested this sale. SET NULL if the connection is removed so completed sales stay auditable.';

REVOKE ALL ON FUNCTION public.delete_pos_connection(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pos_connection(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
