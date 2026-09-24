-- Customer money is recorded only by the Payment Engine (2026-09-25).
--
-- Rule: nothing may make money appear received without a Payment Engine settlement.
--   Ozow   → payment_intent → verified Notify → settleDocumentIntent / settlePosIntent
--   Cash   → payment_intent → approved settlement (POS till, or an owner/manager recording money
--            received offline via POST /api/payment-intents/document-record) → same adapters
-- Both run server-side (service_role). Received money lives in exactly three places —
-- payments, invoices.status (derived), pos_sales_events — and after this migration end users
-- (authenticated / anon JWTs through PostgREST) can create none of them directly:
--
--   1. payments          — INSERT / UPDATE / DELETE revoked from authenticated and anon, the
--                          "org members write payments" (FOR ALL) policy dropped. Reads unchanged.
--                          Before: any org member (employee, POS-only staff) could insert a "paid"
--                          row, edit or delete an Ozow settlement, or pre-claim an intent reference.
--   2. invoices.status   — an end user cannot INSERT an invoice as paid / partially paid, and can
--                          move one INTO those states only when confirmed payments (now Engine-only)
--                          already support it. Every other status change is untouched.
--   3. payment_intents   — a document intent may use provider 'cash' (approved offline settlement).
--   (pos_sales_events and payment_intents are already service_role-write only: 20260828*.)
--
-- Roll back:
--   GRANT INSERT, UPDATE, DELETE ON public.payments TO authenticated;  -- and recreate the policy
--   DROP TRIGGER paidly_invoice_paid_status_guard ON public.invoices;
--
-- Idempotent.

-- ── 1. payments: Payment Engine (service_role) writes only ─────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payments FROM authenticated, anon;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;
DROP POLICY IF EXISTS "org members write payments" ON public.payments;

-- ── 2. invoices.status → paid / partially_paid only when payments support it ──────────
-- Confirmed received amount. Mirrors shared/payments/invoiceBalance.js (isConfirmedInvoicePayment).
CREATE OR REPLACE FUNCTION public.paidly_invoice_confirmed_paid(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(sum(round(coalesce(p.amount, 0), 2)), 0)
  FROM public.payments p
  WHERE p.invoice_id = p_invoice_id
    AND lower(btrim(coalesce(p.status, ''))) NOT IN ('failed', 'cancelled', 'canceled', 'expired')
    AND (
      lower(btrim(coalesce(p.status, ''))) IN ('paid', 'completed', 'success')
      OR p.paid_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.paidly_invoice_confirmed_paid(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.paidly_invoice_paid_state(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(btrim(coalesce(p_status, '')))
    WHEN 'paid' THEN 'paid'
    WHEN 'partially_paid' THEN 'partially_paid'
    WHEN 'partial_paid' THEN 'partially_paid'
    WHEN 'partial' THEN 'partially_paid'
    WHEN 'partially paid' THEN 'partially_paid'
    ELSE NULL
  END;
$$;

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
  IF TG_OP = 'UPDATE' AND v_new IS NOT DISTINCT FROM public.paidly_invoice_paid_state(OLD.status) THEN
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
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.paidly_guard_invoice_paid_status();

-- ── 3. payment_intents: invoices may settle as approved cash ───────────────────────────
ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_pos_provider_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_pos_provider_check CHECK (
    (source_kind = 'pos' AND provider IN ('cash', 'ozow', 'card_terminal'))
    OR (source_kind = 'document' AND provider IN ('ozow', 'cash'))
  );

COMMENT ON COLUMN public.payment_intents.provider IS
  'Customer rail: ozow (verified Notify), cash (till, or approved offline receipt for an invoice), card_terminal (POS; off in production until an acquirer exists). Never payfast.';

-- ── Post-conditions ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.payments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payments', 'DELETE') THEN
    RAISE EXCEPTION 'payments: authenticated must not write';
  END IF;
END $$;
