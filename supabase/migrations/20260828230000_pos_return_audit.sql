-- Append-only POS returns. The original sale is never deleted to reverse money.
-- Refund state is derived from child sale_kind=return rows and snapshotted on the sale.
-- Card/digital provider refunds (Ozow / card_terminal) are not V1: stamp pending_provider
-- and keep payment_intents.refund_of_intent_id for a later refund intent.

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE EXCEPTION 'pos_sales_events missing. Run scripts/apply-pos-integrations.sql first.';
  END IF;
END $$;

ALTER TABLE public.pos_sales_events
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_rail text,
  ADD COLUMN IF NOT EXISTS original_payment_intent_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_sales_events_refund_status_check'
      AND conrelid = 'public.pos_sales_events'::regclass
  ) THEN
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_refund_status_check
      CHECK (refund_status IN ('none', 'partial', 'full'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_sales_events_refund_rail_check'
      AND conrelid = 'public.pos_sales_events'::regclass
  ) THEN
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_refund_rail_check
      CHECK (refund_rail IS NULL OR refund_rail IN ('till_cash', 'pending_provider', 'provider'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_sales_events_refunded_amount_check'
      AND conrelid = 'public.pos_sales_events'::regclass
  ) THEN
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_refunded_amount_check
      CHECK (refunded_amount >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_sales_events_refund_status
  ON public.pos_sales_events (org_id, refund_status)
  WHERE sale_kind = 'sale' AND refund_status <> 'none';

UPDATE public.pos_sales_events
SET refund_rail = CASE
  WHEN lower(coalesce(payment_method, 'cash')) = 'cash' THEN 'till_cash'
  ELSE 'pending_provider'
END
WHERE sale_kind = 'return'
  AND refund_rail IS NULL;

DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NULL THEN
    RAISE NOTICE 'payment_intents missing — skip refund_of_intent_id (apply 20260828180000_payment_intents.sql)';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS refund_of_intent_id uuid';
  EXECUTE 'ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_refund_of_intent_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.payment_intents
      ADD CONSTRAINT payment_intents_refund_of_intent_id_fkey
      FOREIGN KEY (refund_of_intent_id) REFERENCES public.payment_intents(id) ON DELETE SET NULL
  $c$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_intents_refund_of ON public.payment_intents (refund_of_intent_id) WHERE refund_of_intent_id IS NOT NULL';
  EXECUTE $c$
    COMMENT ON COLUMN public.payment_intents.refund_of_intent_id IS
      'Future provider refund intent pointing at the original paid intent. Unused in V1.'
  $c$;
  EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_original_payment_intent_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_original_payment_intent_id_fkey
      FOREIGN KEY (original_payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE SET NULL
  $c$;
END $$;

-- Financial identity is immutable. Operational fields (inventory flags, invoice
-- link, refund snapshot, client attach, refund_rail completion) may still change.
-- DELETE is not blocked here: pos_connections.connection_id ON DELETE CASCADE
-- must still remove events when a connection is deleted. Returns must INSERT a
-- child row instead of DELETE/UPDATE of totals.

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
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
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

DROP TRIGGER IF EXISTS tr_pos_sales_event_financial_immutable ON public.pos_sales_events;
CREATE TRIGGER tr_pos_sales_event_financial_immutable
BEFORE UPDATE ON public.pos_sales_events
FOR EACH ROW
EXECUTE FUNCTION public.pos_sales_event_financial_immutable();

COMMENT ON COLUMN public.pos_sales_events.refund_status IS
  'Snapshot on the original sale: none | partial | full. Derived from child return events. Original totals are never rewritten.';

COMMENT ON COLUMN public.pos_sales_events.refunded_amount IS
  'Sum of abs(child return total_amount). Original total_amount stays the sale total.';

COMMENT ON COLUMN public.pos_sales_events.refund_rail IS
  'On return rows: till_cash (drawer), pending_provider (V1 card/digital restock), provider (future Ozow/terminal refund).';

COMMENT ON COLUMN public.pos_sales_events.original_payment_intent_id IS
  'Original sale payment_intents.id copied onto the return. V1 does not mark that intent refunded.';

COMMENT ON COLUMN public.pos_sales_events.sale_kind IS
  'sale = retail checkout; return = append-only restock/refund against parent_event_id. Never delete the original sale to reverse it.';
