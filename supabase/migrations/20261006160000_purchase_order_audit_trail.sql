-- Purchase order audit trail + supplier payment methods (2026-10-06).
-- Builds on 20261006120000_purchase_order_financials.sql and 20261006140000_purchase_order_approval_terms.sql.
--
-- 1. purchase_order_events: org-scoped, append-only history of every important PO event — created,
--    draft saved/edited, submitted, returned to draft (with reason), approved, goods received (per line),
--    fully received, sent to supplier, payment recorded/changed/removed, cancelled (with reason).
--    Same pattern as payroll_audit_logs: written only by SECURITY DEFINER triggers, readable by the
--    company's financial viewers (owner/admin/manager), never writable from the browser.
-- 2. return_purchase_order_to_draft(id, reason): the "reject" path, so the reason is on record.
-- 3. A PO's supplier must belong to the PO's company (trigger), closing a cross-company reference gap.
-- 4. record_purchase_order_payment accepts the business payment methods the expense form already uses
--    (cash, eft, bank_transfer, credit_card, debit_card, check, other; 'card' kept for older clients).

-- ── Events table ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- SET NULL keeps the record when a draft is deleted; po_number says which order it was.
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_number text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_events_po
  ON public.purchase_order_events (purchase_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_order_events_org
  ON public.purchase_order_events (org_id, created_at DESC);

ALTER TABLE public.purchase_order_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_order_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.purchase_order_events FROM authenticated;
GRANT SELECT ON TABLE public.purchase_order_events TO authenticated;
GRANT ALL ON TABLE public.purchase_order_events TO service_role;

DROP POLICY IF EXISTS "org financial viewers read purchase order events" ON public.purchase_order_events;
CREATE POLICY "org financial viewers read purchase order events" ON public.purchase_order_events
  FOR SELECT TO authenticated
  USING (public.can_view_org_financials(org_id));

-- Same RESTRICTIVE guard every org_id table got in 20260928140000.
DROP POLICY IF EXISTS "inactive members have no org access" ON public.purchase_order_events;
CREATE POLICY "inactive members have no org access" ON public.purchase_order_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_blocked_member_for_org(org_id))
  WITH CHECK (NOT public.is_blocked_member_for_org(org_id));

COMMENT ON TABLE public.purchase_order_events IS
  'Append-only purchase order history (actor, time, status change, details). Trigger-written; financial viewers read.';

-- ── Writer (internal) ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_order_log_event(
  p_org_id uuid,
  p_purchase_order_id uuid,
  p_po_number text,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.purchase_order_events (org_id, purchase_order_id, po_number, actor_id, action, from_status, to_status, metadata)
  VALUES (p_org_id, p_purchase_order_id, p_po_number, auth.uid(), p_action, p_from_status, p_to_status,
          coalesce(jsonb_strip_nulls(p_metadata), '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.purchase_order_log_event(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_log_event(uuid, uuid, text, text, text, text, jsonb) TO service_role;

-- ── Header events ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_orders_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_internal boolean := coalesce(current_setting('paidly.po_internal', true), '') = 'on';
  v_reason text := nullif(current_setting('paidly.po_event_reason', true), '');
  v_action text;
  v_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.purchase_order_log_event(NEW.org_id, NEW.id, NEW.po_number, 'created', NULL, NEW.status,
      jsonb_build_object('revises_purchase_order_id', NEW.revises_purchase_order_id,
                         'payment_terms', NEW.payment_terms, 'due_date', NEW.due_date));
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE
      WHEN OLD.status = 'draft' AND NEW.status = 'pending_approval' THEN 'submitted'
      WHEN OLD.status = 'pending_approval' AND NEW.status = 'draft' THEN 'returned_to_draft'
      WHEN NEW.status = 'approved' THEN 'approved'
      WHEN NEW.status = 'received' THEN 'fully_received'
      WHEN NEW.status = 'cancelled' THEN 'cancelled'
      ELSE NULL  -- partially_received: each receipt is logged per line below
    END;
    IF v_action IS NOT NULL THEN
      PERFORM public.purchase_order_log_event(NEW.org_id, NEW.id, NEW.po_number, v_action, OLD.status, NEW.status,
        jsonb_build_object(
          'total_amount', NEW.total_amount,
          'received_amount', NEW.received_amount,
          'amount_paid', NEW.amount_paid,
          'due_date', NEW.due_date,
          'reason', CASE
            WHEN v_action = 'cancelled' THEN NEW.cancellation_reason
            WHEN v_action = 'returned_to_draft' THEN v_reason
          END
        ));
    END IF;
  END IF;

  IF NEW.sent_at IS DISTINCT FROM OLD.sent_at AND NEW.sent_at IS NOT NULL THEN
    PERFORM public.purchase_order_log_event(NEW.org_id, NEW.id, NEW.po_number, 'sent_to_supplier', NEW.status, NEW.status,
      jsonb_build_object('email', NEW.sent_to_email));
  END IF;

  -- Edits by a person (not the database's own recalculation). Every draft save counts, because it
  -- replaces the lines even when no header field changed.
  IF NOT v_internal AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN v_fields := array_append(v_fields, 'supplier'); END IF;
    IF NEW.order_date IS DISTINCT FROM OLD.order_date THEN v_fields := array_append(v_fields, 'order_date'); END IF;
    IF NEW.expected_date IS DISTINCT FROM OLD.expected_date THEN v_fields := array_append(v_fields, 'expected_date'); END IF;
    IF NEW.payment_terms_code IS DISTINCT FROM OLD.payment_terms_code THEN v_fields := array_append(v_fields, 'payment_terms'); END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN v_fields := array_append(v_fields, 'due_date'); END IF;
    IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
       OR NEW.delivery_instructions IS DISTINCT FROM OLD.delivery_instructions THEN v_fields := array_append(v_fields, 'delivery'); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN v_fields := array_append(v_fields, 'notes'); END IF;
    IF NEW.terms IS DISTINCT FROM OLD.terms THEN v_fields := array_append(v_fields, 'terms'); END IF;
    IF NEW.expense_category IS DISTINCT FROM OLD.expense_category THEN v_fields := array_append(v_fields, 'expense_category'); END IF;

    IF OLD.status = 'draft' AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      PERFORM public.purchase_order_log_event(NEW.org_id, NEW.id, NEW.po_number, 'draft_saved', NEW.status, NEW.status,
        jsonb_build_object('fields', to_jsonb(v_fields)));
    ELSIF OLD.status <> 'draft' AND cardinality(v_fields) > 0 THEN
      PERFORM public.purchase_order_log_event(NEW.org_id, NEW.id, NEW.po_number, 'edited', NEW.status, NEW.status,
        jsonb_build_object('fields', to_jsonb(v_fields)));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_orders_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_orders_audit ON public.purchase_orders;
CREATE TRIGGER purchase_orders_audit
  AFTER INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_audit();

-- ── A PO's supplier must belong to the same company ──────────────────────────────────────────
-- The FK alone accepts any supplier id, and RLS does not check referenced rows, so a company could point
-- its PO at another company's supplier (same class of gap expenses_supplier_same_org closed for expenses).
CREATE OR REPLACE FUNCTION public.purchase_orders_supplier_same_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Supplier does not belong to this company.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_orders_supplier_same_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_orders_supplier_same_org ON public.purchase_orders;
CREATE TRIGGER purchase_orders_supplier_same_org
  BEFORE INSERT OR UPDATE OF supplier_id, org_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_supplier_same_org();

-- ── Receiving events (one per receipt, per line) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_order_items_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po record;
  v_name text;
BEGIN
  IF NEW.quantity_received <= OLD.quantity_received THEN
    RETURN NULL;
  END IF;
  SELECT po.org_id, po.po_number, po.status INTO v_po FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;
  SELECT coalesce(s.name, NEW.description) INTO v_name FROM (SELECT 1) x LEFT JOIN public.services s ON s.id = NEW.product_id;
  PERFORM public.purchase_order_log_event(v_po.org_id, NEW.purchase_order_id, v_po.po_number, 'goods_received', v_po.status, v_po.status,
    jsonb_build_object(
      'line_id', NEW.id,
      'item', coalesce(v_name, NEW.description),
      'quantity', NEW.quantity_received - OLD.quantity_received,
      'received_total', NEW.quantity_received,
      'ordered', NEW.quantity_ordered,
      'remaining', NEW.quantity_ordered - NEW.quantity_received
    ));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_items_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_order_items_audit ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_audit
  AFTER UPDATE OF quantity_received ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_audit();

-- ── Payment events ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expenses_purchase_order_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po record;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.purchase_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id OR NEW.amount IS DISTINCT FROM OLD.amount) THEN
    SELECT po.org_id, po.po_number, po.status, po.amount_paid, po.total_amount INTO v_po
    FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;
    PERFORM public.purchase_order_log_event(v_po.org_id, NEW.purchase_order_id, v_po.po_number,
      CASE WHEN TG_OP = 'INSERT' OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN 'payment_recorded' ELSE 'payment_changed' END,
      v_po.status, v_po.status,
      jsonb_build_object(
        'expense_id', NEW.id,
        'expense_number', NEW.expense_number,
        'amount', NEW.amount,
        'previous_amount', CASE WHEN TG_OP = 'UPDATE' THEN OLD.amount END,
        'paid_on', NEW.date,
        'method', NEW.payment_method,
        'reference', NEW.payment_reference,
        'amount_paid', v_po.amount_paid,
        'outstanding', greatest(v_po.total_amount - v_po.amount_paid, 0)
      ));
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.purchase_order_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id) THEN
    SELECT po.org_id, po.po_number, po.status INTO v_po FROM public.purchase_orders po WHERE po.id = OLD.purchase_order_id;
    IF FOUND THEN
      PERFORM public.purchase_order_log_event(v_po.org_id, OLD.purchase_order_id, v_po.po_number, 'payment_removed', v_po.status, v_po.status,
        jsonb_build_object('expense_id', OLD.id, 'expense_number', OLD.expense_number, 'amount', OLD.amount, 'paid_on', OLD.date));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.expenses_purchase_order_audit() FROM PUBLIC, anon, authenticated;

-- Named to fire after expenses_purchase_order_rollup (alphabetical), so amount_paid is already updated.
DROP TRIGGER IF EXISTS expenses_purchase_order_zaudit ON public.expenses;
CREATE TRIGGER expenses_purchase_order_zaudit
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_purchase_order_audit();

-- ── Return to draft (reject) with a reason ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.return_purchase_order_to_draft(p_purchase_order_id uuid, p_reason text DEFAULT NULL)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po public.purchase_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not signed in.';
  END IF;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Purchase order not found.';
  END IF;
  IF v_po.status <> 'pending_approval' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only purchase orders awaiting approval can go back to draft.';
  END IF;
  PERFORM set_config('paidly.po_event_reason', left(coalesce(btrim(p_reason), ''), 500), true);
  UPDATE public.purchase_orders SET status = 'draft' WHERE id = v_po.id RETURNING * INTO v_po;
  PERFORM set_config('paidly.po_event_reason', '', true);
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.return_purchase_order_to_draft(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_purchase_order_to_draft(uuid, text) TO authenticated, service_role;

-- ── Supplier payment: business payment methods ────────────────────────────────────────────────
-- Same body as 20261006120000 apart from the accepted methods.
CREATE OR REPLACE FUNCTION public.record_purchase_order_payment(
  p_purchase_order_id uuid,
  p_amount numeric,
  p_paid_on date DEFAULT current_date,
  p_payment_method text DEFAULT 'eft',
  p_reference text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_client_operation_id uuid DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po public.purchase_orders;
  v_supplier_name text;
  v_amount numeric(12,2);
  v_vat numeric(12,2);
  v_method text;
  v_count integer;
  v_row public.expenses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not signed in.';
  END IF;

  v_amount := round(coalesce(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Enter a payment amount greater than zero.';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > current_date + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The payment date cannot be in the future.';
  END IF;
  v_method := lower(btrim(coalesce(p_payment_method, '')));
  IF v_method NOT IN ('cash', 'eft', 'bank_transfer', 'credit_card', 'debit_card', 'card', 'check', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Choose a payment method.';
  END IF;

  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Purchase order not found.';
  END IF;

  IF p_client_operation_id IS NOT NULL THEN
    SELECT e.* INTO v_row FROM public.expenses e
    WHERE e.org_id = v_po.org_id AND e.client_operation_id = p_client_operation_id;
    IF FOUND THEN
      RETURN v_row;
    END IF;
  END IF;

  SELECT s.name INTO v_supplier_name FROM public.suppliers s WHERE s.id = v_po.supplier_id;
  v_vat := CASE WHEN v_po.total_amount > 0 THEN round(v_amount * v_po.vat_total / v_po.total_amount, 2) ELSE 0 END;
  SELECT count(*) INTO v_count FROM public.expenses e WHERE e.purchase_order_id = v_po.id;

  INSERT INTO public.expenses (
    org_id, purchase_order_id, supplier_id, vendor, expense_number, description, category,
    amount, vat, subtotal, date, payment_method, payment_reference, notes, capture_source,
    client_operation_id, created_by_id
  ) VALUES (
    v_po.org_id,
    v_po.id,
    v_po.supplier_id,
    v_supplier_name,
    v_po.po_number || '-PAY-' || (v_count + 1),
    'Payment for ' || v_po.po_number || coalesce(' — ' || v_supplier_name, ''),
    coalesce(nullif(lower(btrim(p_category)), ''), v_po.expense_category, 'inventory'),
    v_amount,
    v_vat,
    v_amount - v_vat,
    p_paid_on,
    v_method,
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''),
    'purchase_order',
    p_client_operation_id,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_purchase_order_payment(uuid, numeric, date, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_order_payment(uuid, numeric, date, text, text, text, text, uuid)
  TO authenticated, service_role;
