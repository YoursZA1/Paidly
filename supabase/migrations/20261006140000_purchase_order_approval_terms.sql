-- Purchase orders: editable drafts, submit-for-approval, payment terms + due date, revisions (2026-10-06).
-- Builds on 20261006120000_purchase_order_financials.sql.
--
--   Draft (editable) → Submit → Pending approval → Approved (locked) → Receive → Pay
--                         ↖ Return to draft ↙              ↘ Revise (cancel + new linked draft)
--
-- Financial states, never an expense until paid:
--   Committed = approved, not yet received (net of deposits)
--   Payable   = received, unpaid (supplier liability)
--   Paid      = supplier payments recorded (expenses)
--
-- 1. Status gains 'pending_approval'. Approval now only from pending_approval; lines stay frozen
--    outside draft (already enforced by purchase_order_items_guard).
-- 2. payment_terms_code (due_on_receipt | net_7 | net_15 | net_30 | custom) and due_date. The database
--    computes due_date (order date + N days; due on receipt = expected delivery, then the actual first
--    receipt date; custom = the date given). Terms, due date and other commercial fields lock on submit.
-- 3. save_purchase_order_draft(): create or update a draft and replace its lines in one transaction.
-- 4. revise_purchase_order(): an approved PO with nothing received or paid is cancelled and copied into
--    a new draft linked by revises_purchase_order_id — the original stays on record.

-- ── Columns ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms_code text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revises_purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled'));

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_payment_terms_code_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_payment_terms_code_check
  CHECK (payment_terms_code IS NULL OR payment_terms_code IN ('due_on_receipt', 'net_7', 'net_15', 'net_30', 'custom'));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_due_date
  ON public.purchase_orders (org_id, due_date) WHERE due_date IS NOT NULL;

COMMENT ON COLUMN public.purchase_orders.payment_terms_code IS
  'due_on_receipt | net_7 | net_15 | net_30 | custom. payment_terms holds the display label.';
COMMENT ON COLUMN public.purchase_orders.due_date IS
  'When the supplier must be paid. Database-computed from the terms (custom: as entered). Feeds cash-flow planning.';
COMMENT ON COLUMN public.purchase_orders.revises_purchase_order_id IS
  'The approved PO this draft replaces (revise_purchase_order). The original is cancelled, not edited.';

-- ── Due date (mirrored in shared/procurement/purchaseOrderMath.js) ────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_order_due_date(
  p_code text,
  p_order_date date,
  p_expected_date date,
  p_custom_due_date date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_code
    WHEN 'net_7' THEN p_order_date + 7
    WHEN 'net_15' THEN p_order_date + 15
    WHEN 'net_30' THEN p_order_date + 30
    WHEN 'due_on_receipt' THEN coalesce(p_expected_date, p_order_date)
    WHEN 'custom' THEN p_custom_due_date
    ELSE p_custom_due_date
  END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_order_terms_label(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_code
    WHEN 'due_on_receipt' THEN 'Due on receipt'
    WHEN 'net_7' THEN '7 days'
    WHEN 'net_15' THEN '15 days'
    WHEN 'net_30' THEN '30 days'
    WHEN 'custom' THEN 'Custom'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_due_date(text, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_order_terms_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_due_date(text, date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_order_terms_label(text) TO authenticated, service_role;

-- ── purchase_orders guard (replaces 20261006120000's) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_orders_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF coalesce(current_setting('paidly.po_internal', true), '') = 'on' OR auth.uid() IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft'
       OR (OLD.status = 'cancelled' AND OLD.received_amount = 0 AND OLD.amount_paid = 0) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Only draft purchase orders, or cancelled ones with nothing received or paid, can be deleted.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'New purchase orders start as drafts.';
    END IF;
    NEW.subtotal := 0;
    NEW.discount_total := 0;
    NEW.vat_total := 0;
    NEW.total_amount := 0;
    NEW.received_amount := 0;
    NEW.amount_paid := 0;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.submitted_at := NULL;
    NEW.submitted_by := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancellation_reason := NULL;
    NEW.received_at := NULL;
    NEW.last_received_at := NULL;
    NEW.created_by := auth.uid();
    NEW.payment_terms_code := coalesce(NEW.payment_terms_code, 'net_30');
    NEW.payment_terms := coalesce(public.purchase_order_terms_label(NEW.payment_terms_code), NEW.payment_terms);
    NEW.due_date := public.purchase_order_due_date(NEW.payment_terms_code, NEW.order_date, NEW.expected_date, NEW.due_date);
    IF NEW.due_date IS NOT NULL AND NEW.due_date < NEW.order_date THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The due date cannot be before the order date.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by an end user: money, audit and identity columns keep their stored values.
  NEW.subtotal := OLD.subtotal;
  NEW.discount_total := OLD.discount_total;
  NEW.vat_total := OLD.vat_total;
  NEW.total_amount := OLD.total_amount;
  NEW.received_amount := OLD.received_amount;
  NEW.amount_paid := OLD.amount_paid;
  NEW.received_at := OLD.received_at;
  NEW.last_received_at := OLD.last_received_at;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  NEW.submitted_at := OLD.submitted_at;
  NEW.submitted_by := OLD.submitted_by;
  NEW.cancelled_at := OLD.cancelled_at;
  NEW.po_number := OLD.po_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.revises_purchase_order_id := OLD.revises_purchase_order_id;
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'cancelled' THEN
    NEW.cancellation_reason := OLD.cancellation_reason;
  END IF;

  -- Commercial fields: editable only in draft (terms → label and due date recomputed there).
  IF OLD.status = 'draft' THEN
    NEW.payment_terms_code := coalesce(NEW.payment_terms_code, 'net_30');
    NEW.payment_terms := coalesce(public.purchase_order_terms_label(NEW.payment_terms_code), NEW.payment_terms);
    NEW.due_date := public.purchase_order_due_date(NEW.payment_terms_code, NEW.order_date, NEW.expected_date, NEW.due_date);
    IF NEW.due_date IS NOT NULL AND NEW.due_date < NEW.order_date THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The due date cannot be before the order date.';
    END IF;
  ELSIF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.order_date IS DISTINCT FROM OLD.order_date
     OR NEW.payment_terms_code IS DISTINCT FROM OLD.payment_terms_code
     OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.terms IS DISTINCT FROM OLD.terms THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Supplier, dates, payment terms and conditions are locked once a purchase order is submitted. Return it to draft or revise it.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'pending_approval' THEN
      IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.purchase_order_id = OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Add at least one line before submitting this purchase order.';
      END IF;
      IF OLD.supplier_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Choose a supplier before submitting this purchase order.';
      END IF;
      NEW.submitted_at := now();
      NEW.submitted_by := auth.uid();
    ELSIF OLD.status = 'pending_approval' AND NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
      NEW.submitted_by := NULL;
    ELSIF OLD.status = 'pending_approval' AND NEW.status = 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
    ELSIF NEW.status = 'cancelled' AND OLD.status IN ('draft', 'pending_approval', 'approved', 'partially_received') THEN
      NEW.cancelled_at := now();
    ELSIF OLD.status = 'draft' AND NEW.status = 'approved' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Submit the purchase order for approval first.';
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('A purchase order cannot move from %s to %s.', OLD.status, NEW.status);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_orders_guard() FROM PUBLIC, anon, authenticated;

-- ── Supplier payments: not before approval ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expenses_purchase_order_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po record;
  v_cap numeric;
  v_other numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.purchase_order_id IS NOT NULL
     AND NOT public.can_view_org_financials(OLD.org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only owners and managers can change a supplier payment.';
  END IF;
  IF TG_OP = 'DELETE' OR NEW.purchase_order_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_view_org_financials(NEW.org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only owners and managers can record supplier payments.';
  END IF;
  IF coalesce(NEW.amount, 0) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A supplier payment must be more than zero.';
  END IF;

  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id FOR UPDATE;
  IF NOT FOUND OR v_po.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Purchase order not found for this company.';
  END IF;
  IF v_po.status IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Approve the purchase order before recording a payment.';
  END IF;
  IF v_po.status = 'cancelled' AND v_po.received_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'This purchase order was cancelled before anything was received, so nothing is owed.';
  END IF;

  v_cap := CASE WHEN v_po.status = 'cancelled' THEN v_po.received_amount ELSE v_po.total_amount END;
  SELECT coalesce(sum(e.amount), 0) INTO v_other
  FROM public.expenses e
  WHERE e.purchase_order_id = NEW.purchase_order_id AND e.id IS DISTINCT FROM NEW.id;

  IF v_other + NEW.amount > v_cap THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('This payment is more than the %s still owed on %s.',
        to_char(greatest(v_cap - v_other, 0), 'FM999999999990.00'), v_po.po_number);
  END IF;

  IF v_po.supplier_id IS NOT NULL THEN
    NEW.supplier_id := v_po.supplier_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.expenses_purchase_order_guard() FROM PUBLIC, anon, authenticated;

-- ── Receiving: "due on receipt" becomes due on the actual first receipt ───────────────────────
CREATE OR REPLACE FUNCTION public.receive_purchase_order_item(
  p_po_item_id uuid,
  p_org_id uuid,
  p_quantity_received numeric,
  p_unit_cost numeric
)
RETURNS TABLE(new_stock numeric, new_cost_price numeric)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item RECORD;
  v_po_id uuid;
  v_current_stock numeric;
  v_current_cost numeric;
  v_new_cost numeric;
  v_unit_cost numeric;
  v_remaining_lines integer;
  v_qty numeric(12,2);
  v_prev text := coalesce(current_setting('paidly.po_internal', true), '');
BEGIN
  IF p_po_item_id IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'po_item_id and org_id are required';
  END IF;

  v_qty := ROUND(COALESCE(p_quantity_received, 0), 2);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'quantity_received must be positive';
  END IF;

  SELECT poi.*, po.id AS po_id, po.payment_terms_code AS po_terms, po.last_received_at AS po_last_received_at
  INTO v_item
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = p_po_item_id
    AND poi.org_id = p_org_id
    AND po.status IN ('approved', 'partially_received')
  FOR UPDATE OF poi, po;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'purchase order item not found, not in this org, or PO is not approved';
  END IF;

  IF v_item.quantity_received + v_qty > v_item.quantity_ordered THEN
    RAISE EXCEPTION 'cannot receive % units: only % remaining on this line',
      v_qty, (v_item.quantity_ordered - v_item.quantity_received);
  END IF;

  v_po_id := v_item.po_id;
  v_unit_cost := COALESCE(
    p_unit_cost,
    ROUND(v_item.unit_cost * (1 - COALESCE(v_item.discount_percent, 0) / 100), 2)
  );
  IF v_unit_cost < 0 THEN
    RAISE EXCEPTION 'unit cost cannot be negative';
  END IF;

  IF v_item.product_id IS NOT NULL THEN
    SELECT stock_quantity, COALESCE(cost_price, 0)
    INTO v_current_stock, v_current_cost
    FROM public.services
    WHERE id = v_item.product_id AND org_id = p_org_id
    FOR UPDATE;

    IF (COALESCE(v_current_stock, 0) + v_qty) > 0 THEN
      v_new_cost := ROUND(
        ((COALESCE(v_current_stock, 0) * v_current_cost) + (v_qty * v_unit_cost))
        / (COALESCE(v_current_stock, 0) + v_qty),
        2
      );
    ELSE
      v_new_cost := v_current_cost;
    END IF;

    UPDATE public.services
    SET cost_price = v_new_cost, updated_at = now()
    WHERE id = v_item.product_id AND org_id = p_org_id;

    new_stock := public.apply_inventory_movement(
      v_item.product_id, p_org_id, v_qty, 'in', 'purchase_order', v_po_id
    );
    new_cost_price := v_new_cost;
  END IF;

  PERFORM set_config('paidly.po_internal', 'on', true);

  UPDATE public.purchase_order_items
  SET quantity_received = quantity_received + v_qty,
      updated_at = now()
  WHERE id = p_po_item_id;

  SELECT count(*) INTO v_remaining_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = v_po_id
    AND quantity_received < quantity_ordered;

  UPDATE public.purchase_orders
  SET status = CASE WHEN v_remaining_lines = 0 THEN 'received' ELSE 'partially_received' END,
      received_at = CASE WHEN v_remaining_lines = 0 THEN now() ELSE received_at END,
      last_received_at = now(),
      due_date = CASE
        WHEN v_item.po_terms = 'due_on_receipt' AND v_item.po_last_received_at IS NULL THEN current_date
        ELSE due_date
      END,
      updated_at = now()
  WHERE id = v_po_id;

  PERFORM set_config('paidly.po_internal', v_prev, true);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order_item(uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_item(uuid, uuid, numeric, numeric)
  TO authenticated, service_role;

-- ── Save a draft (create or update) with its lines, atomically ────────────────────────────────
-- SECURITY INVOKER: RLS (owners/managers), the plan guard and the PO/line guards all apply.
-- p_header keys: supplier_id, order_date, expected_date, currency, payment_terms_code, due_date (custom),
--   delivery_address, delivery_instructions, terms, notes, expense_category.
-- p_items: [{ product_id, description, quantity_ordered, unit_cost, discount_percent, vat_rate }]
CREATE OR REPLACE FUNCTION public.save_purchase_order_draft(
  p_purchase_order_id uuid,
  p_org_id uuid,
  p_header jsonb,
  p_items jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_po public.purchase_orders;
  v_h jsonb := coalesce(p_header, '{}'::jsonb);
  v_number text;
  v_text text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not signed in.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Add at least one line to the purchase order.';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A purchase order can have at most 500 lines.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e(value)
    WHERE coalesce(nullif(e.value ->> 'quantity_ordered', '')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every line needs a quantity above zero.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e(value)
    WHERE nullif(e.value ->> 'product_id', '') IS NULL AND nullif(btrim(e.value ->> 'description'), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every line needs a product or a description.';
  END IF;

  IF p_purchase_order_id IS NULL THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'Company is required.';
    END IF;
    v_number := public.next_document_number(p_org_id, 'purchase_order', 'PO');
    INSERT INTO public.purchase_orders (
      org_id, po_number, status, supplier_id, order_date, expected_date, currency, payment_terms_code,
      due_date, delivery_address, delivery_instructions, terms, notes, expense_category
    ) VALUES (
      p_org_id,
      v_number,
      'draft',
      nullif(v_h ->> 'supplier_id', '')::uuid,
      coalesce(nullif(v_h ->> 'order_date', '')::date, current_date),
      nullif(v_h ->> 'expected_date', '')::date,
      coalesce(nullif(v_h ->> 'currency', ''), 'ZAR'),
      nullif(v_h ->> 'payment_terms_code', ''),
      nullif(v_h ->> 'due_date', '')::date,
      nullif(btrim(v_h ->> 'delivery_address'), ''),
      nullif(btrim(v_h ->> 'delivery_instructions'), ''),
      nullif(btrim(v_h ->> 'terms'), ''),
      nullif(btrim(v_h ->> 'notes'), ''),
      coalesce(nullif(v_h ->> 'expense_category', ''), 'inventory')
    )
    RETURNING * INTO v_po;
  ELSE
    SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = p_purchase_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Purchase order not found.';
    END IF;
    IF v_po.status <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'Only drafts can be edited. Return it to draft, or revise an approved purchase order.';
    END IF;
    UPDATE public.purchase_orders SET
      supplier_id = nullif(v_h ->> 'supplier_id', '')::uuid,
      order_date = coalesce(nullif(v_h ->> 'order_date', '')::date, order_date),
      expected_date = nullif(v_h ->> 'expected_date', '')::date,
      currency = coalesce(nullif(v_h ->> 'currency', ''), currency),
      payment_terms_code = nullif(v_h ->> 'payment_terms_code', ''),
      due_date = nullif(v_h ->> 'due_date', '')::date,
      delivery_address = nullif(btrim(v_h ->> 'delivery_address'), ''),
      delivery_instructions = nullif(btrim(v_h ->> 'delivery_instructions'), ''),
      terms = nullif(btrim(v_h ->> 'terms'), ''),
      notes = nullif(btrim(v_h ->> 'notes'), ''),
      expense_category = coalesce(nullif(v_h ->> 'expense_category', ''), expense_category),
      updated_at = now()
    WHERE id = v_po.id;
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = v_po.id;
  END IF;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, org_id, product_id, description, quantity_ordered, unit_cost,
    discount_percent, vat_rate, sort_order
  )
  SELECT
    v_po.id,
    v_po.org_id,
    nullif(e.value ->> 'product_id', '')::uuid,
    nullif(btrim(e.value ->> 'description'), ''),
    (e.value ->> 'quantity_ordered')::numeric,
    coalesce(nullif(e.value ->> 'unit_cost', '')::numeric, 0),
    coalesce(nullif(e.value ->> 'discount_percent', '')::numeric, 0),
    coalesce(nullif(e.value ->> 'vat_rate', '')::numeric, 0),
    (e.ordinality - 1)::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality);

  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = v_po.id;
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.save_purchase_order_draft(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order_draft(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;

-- ── Revise an approved PO: cancel it and copy it into a new linked draft ──────────────────────
CREATE OR REPLACE FUNCTION public.revise_purchase_order(p_purchase_order_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old public.purchase_orders;
  v_new public.purchase_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not signed in.';
  END IF;

  SELECT po.* INTO v_old FROM public.purchase_orders po WHERE po.id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Purchase order not found.';
  END IF;
  IF v_old.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Only approved purchase orders can be revised. Return a pending one to draft instead.';
  END IF;
  IF v_old.received_amount > 0 OR v_old.amount_paid > 0
     OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.purchase_order_id = v_old.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Goods have been received or paid on this purchase order, so it cannot be revised. Cancel the remainder and raise a new order.';
  END IF;

  INSERT INTO public.purchase_orders (
    org_id, po_number, status, supplier_id, order_date, expected_date, currency, payment_terms_code,
    due_date, delivery_address, delivery_instructions, terms, notes, expense_category, revises_purchase_order_id
  ) VALUES (
    v_old.org_id,
    public.next_document_number(v_old.org_id, 'purchase_order', 'PO'),
    'draft',
    v_old.supplier_id,
    current_date,
    v_old.expected_date,
    v_old.currency,
    v_old.payment_terms_code,
    CASE WHEN v_old.payment_terms_code = 'custom' THEN greatest(v_old.due_date, current_date) END,
    v_old.delivery_address,
    v_old.delivery_instructions,
    v_old.terms,
    v_old.notes,
    v_old.expense_category,
    v_old.id
  )
  RETURNING * INTO v_new;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, org_id, product_id, description, quantity_ordered, unit_cost,
    discount_percent, vat_rate, sort_order
  )
  SELECT v_new.id, i.org_id, i.product_id, i.description, i.quantity_ordered, i.unit_cost,
         i.discount_percent, i.vat_rate, i.sort_order
  FROM public.purchase_order_items i
  WHERE i.purchase_order_id = v_old.id;

  UPDATE public.purchase_orders
  SET status = 'cancelled', cancellation_reason = 'Revised as ' || v_new.po_number
  WHERE id = v_old.id;

  SELECT po.* INTO v_new FROM public.purchase_orders po WHERE po.id = v_new.id;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_purchase_order(uuid) TO authenticated, service_role;

-- ── Backfill: label existing free-text terms where they match a standard term ──────────────────
DO $$
BEGIN
  PERFORM set_config('paidly.po_internal', 'on', true);
  UPDATE public.purchase_orders
  SET payment_terms_code = CASE
        WHEN payment_terms ~* '^\s*(cod|due on receipt|on receipt)\s*$' THEN 'due_on_receipt'
        WHEN payment_terms ~* '^\s*7\s*days?' THEN 'net_7'
        WHEN payment_terms ~* '^\s*15\s*days?' THEN 'net_15'
        WHEN payment_terms ~* '^\s*30\s*days?' THEN 'net_30'
        ELSE NULL
      END
  WHERE payment_terms_code IS NULL AND payment_terms IS NOT NULL;
  UPDATE public.purchase_orders
  SET due_date = public.purchase_order_due_date(payment_terms_code, order_date, expected_date, NULL)
  WHERE due_date IS NULL AND payment_terms_code IS NOT NULL AND payment_terms_code <> 'custom';
  PERFORM set_config('paidly.po_internal', '', true);
END $$;
