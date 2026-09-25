-- Customer Payment Engine follow-ups (2026-09-25, after 20260925090000_customer_payment_integrity_guards).
--
-- 1. invoices: the paid-status guard also runs when total_amount changes.
--    Before: the trigger fired on UPDATE OF status only, so an end user could
--      (a) UPDATE invoices SET total_amount = 0, status = 'paid'   -- 0 received >= 0 total: allowed
--      (b) UPDATE invoices SET total_amount = 1000                  -- status untouched: trigger skipped
--    and end with a R1000 invoice marked paid and no payment behind it.
--    Now: while an invoice is paid / partially paid, a total change is re-checked against payments.
--    (The app already locks paid and partially paid invoices for editing — src/logic/invoiceLogic.js.)
--
-- 2. payments: one row per Payment Engine settlement, for every rail.
--    Settlements store payments.reference = payment_intents.id. The unique index from
--    20260908140000 covered method = 'ozow' only; approved offline settlements (cash, EFT, card
--    machine…) write method = cash / bank_transfer / … and had no database backstop, so two
--    concurrent settlements of the same intent could both insert.
--
-- 3. pos_sales_events: one sale per payment intent. The till / Paidly Pay settlement adapters dedupe
--    on (connection_id, external_id); a snapshot without a connection, or the same idempotency key on
--    another register, had no backstop against two sales from one payment.
--
-- 2 and 3 are created only when existing rows already satisfy them (otherwise a WARNING names the
-- query to run; the app-level checks still apply). Service-role writers are not gated by (1).
--
-- Roll back:
--   DROP INDEX IF EXISTS public.payments_engine_intent_reference_uniq;
--   DROP INDEX IF EXISTS public.pos_sales_events_one_sale_per_intent;
--   Re-run section 2 of 20260925090000_customer_payment_integrity_guards.sql (status-only trigger).
--
-- Idempotent.

-- ── 1. invoices.status / total_amount ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.paidly_guard_invoice_paid_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new text := public.paidly_invoice_paid_state(NEW.status);
  v_total numeric := round(coalesce(NEW.total_amount, 0), 2);
  v_paid numeric := 0;
BEGIN
  -- Payment Engine settlement and other server writers (service_role).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_new IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND v_new IS NOT DISTINCT FROM public.paidly_invoice_paid_state(OLD.status)
     AND v_total = round(coalesce(OLD.total_amount, 0), 2) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_paid := public.paidly_invoice_confirmed_paid(NEW.id);
    IF v_new = 'paid' AND v_paid + 0.005 >= v_total THEN
      RETURN NEW;
    END IF;
    IF v_new = 'partially_paid' AND v_paid > 0 AND v_paid + 0.005 < v_total THEN
      RETURN NEW;
    END IF;
  END IF;
  -- INSERT: a new invoice has no payments yet, so it can never start paid.

  RAISE EXCEPTION USING ERRCODE = 'P0001',
    MESSAGE = format(
      'An invoice is %s only through recorded payments (%s received of %s). Record the payment instead.',
      replace(v_new, '_', ' '), v_paid, v_total
    ),
    HINT = 'INVOICE_STATUS_NEEDS_PAYMENT';
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_guard_invoice_paid_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS paidly_invoice_paid_status_guard ON public.invoices;
CREATE TRIGGER paidly_invoice_paid_status_guard
  BEFORE INSERT OR UPDATE OF status, total_amount ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.paidly_guard_invoice_paid_status();

-- ── 2. payments: one row per settled payment_intent (all rails) ────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY org_id, lower(reference)
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'payments_engine_intent_reference_uniq not created: duplicate intent references exist. Find them with: SELECT org_id, lower(reference), count(*) FROM public.payments WHERE reference ~* ''^[0-9a-f-]{36}$'' GROUP BY 1, 2 HAVING count(*) > 1;';
  ELSE
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS payments_engine_intent_reference_uniq
        ON public.payments (org_id, lower(reference))
        WHERE reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $idx$;
    COMMENT ON INDEX public.payments_engine_intent_reference_uniq IS
      'Payment Engine settlement is idempotent on every rail: payments.reference = payment_intents.id.';
  END IF;
END $$;

-- ── 3. pos_sales_events: one sale per payment_intent ───────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pos_sales_events' AND column_name = 'payment_intent_id'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pos_sales_events' AND column_name = 'sale_kind'
     ) THEN
    RAISE NOTICE 'pos_sales_events.payment_intent_id / sale_kind missing — apply the 20260828 POS migrations, then re-run this file';
  ELSIF EXISTS (
    SELECT 1
    FROM public.pos_sales_events
    WHERE payment_intent_id IS NOT NULL AND coalesce(sale_kind, 'sale') = 'sale'
    GROUP BY payment_intent_id
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'pos_sales_events_one_sale_per_intent not created: a payment intent already carries more than one sale. Find them with: SELECT payment_intent_id, count(*) FROM public.pos_sales_events WHERE payment_intent_id IS NOT NULL AND coalesce(sale_kind, ''sale'') = ''sale'' GROUP BY 1 HAVING count(*) > 1;';
  ELSE
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_events_one_sale_per_intent
        ON public.pos_sales_events (payment_intent_id)
        WHERE payment_intent_id IS NOT NULL AND coalesce(sale_kind, 'sale') = 'sale'
    $idx$;
    COMMENT ON INDEX public.pos_sales_events_one_sale_per_intent IS
      'A paid payment_intent settles exactly one POS sale (returns reference original_payment_intent_id).';
  END IF;
END $$;
