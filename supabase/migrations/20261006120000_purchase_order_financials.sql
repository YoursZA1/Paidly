-- Purchase orders become procurement documents tied to finance (2026-10-06).
--
--   Purchase Order → Approval (commitment) → Receiving → Supplier payment → Expense → Cash flow
--
-- Invoice = money coming in. Purchase order = money the business has committed to spend.
-- Expense = money actually spent. Approving a PO commits spend; it is never an expense. Only a
-- recorded supplier payment (an expenses row linked by purchase_order_id) reaches cash flow.
--
-- 1. purchase_orders gains document fields (order date, currency, payment terms, delivery, terms,
--    expense category) and money columns maintained by the database: subtotal, discount_total,
--    vat_total, total_amount (committed value), received_amount (value of goods received) and
--    amount_paid (sum of linked supplier payments). Clients cannot write the money columns.
-- 2. purchase_order_items gains description (free-text lines need no catalog product), discount %,
--    VAT % and computed line amounts. Lines must sit in the PO's own company, a product must be from
--    that company, and lines are frozen once the PO leaves draft.
-- 3. Status moves only along draft → approved → partially_received → received, or → cancelled
--    (draft/approved/partially_received). Received states are set only by receive_purchase_order_item.
-- 4. expenses.purchase_order_id links a supplier payment to its PO. Linking needs company financial
--    rights; a PO must be approved first; payments can never exceed what is owed (total, or the received
--    value once cancelled). record_purchase_order_payment() writes that expense in one call.
--
-- Line math (mirrored exactly in shared/procurement/purchaseOrderMath.js):
--   gross = round(qty × unit_cost, 2); discount = round(gross × discount% / 100, 2)
--   net = gross − discount; vat = round(net × vat% / 100, 2); total = net + vat

-- ── Line math ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_order_line_amounts(
  p_quantity numeric,
  p_unit_cost numeric,
  p_discount_percent numeric,
  p_vat_rate numeric,
  OUT gross numeric,
  OUT discount numeric,
  OUT net numeric,
  OUT vat numeric,
  OUT total numeric
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  gross := round(coalesce(p_quantity, 0) * coalesce(p_unit_cost, 0), 2);
  discount := round(gross * coalesce(p_discount_percent, 0) / 100, 2);
  net := gross - discount;
  vat := round(net * coalesce(p_vat_rate, 0) / 100, 2);
  total := net + vat;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_line_amounts(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_line_amounts(numeric, numeric, numeric, numeric)
  TO authenticated, service_role;

-- ── purchase_orders: document + money columns ─────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS order_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS terms text,
  ADD COLUMN IF NOT EXISTS expense_category text NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled'));

COMMENT ON COLUMN public.purchase_orders.total_amount IS
  'Committed value incl. VAT (sum of line totals). Database-maintained; not an expense.';
COMMENT ON COLUMN public.purchase_orders.received_amount IS
  'Value of goods received so far incl. VAT, at PO prices. Database-maintained.';
COMMENT ON COLUMN public.purchase_orders.amount_paid IS
  'Sum of linked supplier payments (expenses.purchase_order_id). Database-maintained.';
COMMENT ON COLUMN public.purchase_orders.expense_category IS
  'Expense category used when a supplier payment for this PO is recorded.';

-- ── purchase_order_items: free-text lines, discount, VAT, computed amounts ────────────────────
ALTER TABLE public.purchase_order_items
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_discount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_product_or_description;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_or_description
  CHECK (product_id IS NOT NULL OR nullif(btrim(description), '') IS NOT NULL);
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_unit_cost_nonneg;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_unit_cost_nonneg
  CHECK (unit_cost >= 0);
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_discount_range;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_discount_range
  CHECK (discount_percent >= 0 AND discount_percent <= 100);
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_vat_range;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_vat_range
  CHECK (vat_rate >= 0 AND vat_rate <= 100);

COMMENT ON COLUMN public.purchase_order_items.unit_cost IS 'Unit price excluding VAT, before line discount.';
COMMENT ON COLUMN public.purchase_order_items.line_total IS 'Net of discount plus VAT. Database-maintained.';

-- ── expenses: supplier payment link ───────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS expenses_purchase_order_idx
  ON public.expenses (purchase_order_id) WHERE purchase_order_id IS NOT NULL;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_capture_source_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_capture_source_check
  CHECK (capture_source IS NULL OR capture_source IN ('manual', 'receipt_scan', 'csv_import', 'bank_import', 'purchase_order'));

COMMENT ON COLUMN public.expenses.purchase_order_id IS
  'Supplier payment against this purchase order. Payments never exceed what the PO owes (trigger-enforced).';
COMMENT ON COLUMN public.expenses.payment_reference IS 'Bank / EFT / card reference for the payment.';

-- ── Internal-write flag ───────────────────────────────────────────────────────────────────────
-- Money columns, received quantities and received statuses are written only by the functions below.
-- They raise paidly.po_internal for their own statement and restore the previous value afterwards.
-- PostgREST cannot set this GUC from a request.

CREATE OR REPLACE FUNCTION public.purchase_order_recalculate(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('paidly.po_internal', true), '');
BEGIN
  PERFORM set_config('paidly.po_internal', 'on', true);
  UPDATE public.purchase_orders po
  SET subtotal = t.subtotal,
      discount_total = t.discount_total,
      vat_total = t.vat_total,
      total_amount = t.total_amount,
      received_amount = t.received_amount,
      updated_at = now()
  FROM (
    SELECT
      coalesce(sum(i.line_subtotal), 0) AS subtotal,
      coalesce(sum(i.line_discount), 0) AS discount_total,
      coalesce(sum(i.line_vat), 0) AS vat_total,
      coalesce(sum(i.line_total), 0) AS total_amount,
      coalesce(sum((public.purchase_order_line_amounts(
        i.quantity_received, i.unit_cost, i.discount_percent, i.vat_rate)).total), 0) AS received_amount
    FROM public.purchase_order_items i
    WHERE i.purchase_order_id = p_purchase_order_id
  ) t
  WHERE po.id = p_purchase_order_id;
  PERFORM set_config('paidly.po_internal', v_prev, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_order_refresh_paid(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('paidly.po_internal', true), '');
BEGIN
  PERFORM set_config('paidly.po_internal', 'on', true);
  UPDATE public.purchase_orders po
  SET amount_paid = coalesce((
        SELECT sum(e.amount) FROM public.expenses e WHERE e.purchase_order_id = p_purchase_order_id
      ), 0),
      updated_at = now()
  WHERE po.id = p_purchase_order_id;
  PERFORM set_config('paidly.po_internal', v_prev, true);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_recalculate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_order_refresh_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_recalculate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purchase_order_refresh_paid(uuid) TO service_role;

-- ── purchase_orders guard: money columns, status flow, locked fields ──────────────────────────
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
    NEW.cancelled_at := NULL;
    NEW.received_at := NULL;
    NEW.last_received_at := NULL;
    NEW.created_by := auth.uid();
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
  NEW.cancelled_at := OLD.cancelled_at;
  NEW.po_number := OLD.po_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
      IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.purchase_order_id = OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Add at least one line before approving this purchase order.';
      END IF;
      NEW.approved_at := now();
      NEW.approved_by := auth.uid();
    ELSIF NEW.status = 'cancelled' AND OLD.status IN ('draft', 'approved', 'partially_received') THEN
      NEW.cancelled_at := now();
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('A purchase order cannot move from %s to %s.', OLD.status, NEW.status);
    END IF;
  ELSIF OLD.status <> 'draft' AND (
    NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.order_date IS DISTINCT FROM OLD.order_date
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Supplier, currency and order date are locked once a purchase order is approved.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_orders_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_orders_guard ON public.purchase_orders;
CREATE TRIGGER purchase_orders_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_guard();

-- ── purchase_order_items guard: same company, frozen after draft, computed amounts ────────────
CREATE OR REPLACE FUNCTION public.purchase_order_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_internal boolean := coalesce(current_setting('paidly.po_internal', true), '') = 'on';
  v_end_user boolean := auth.uid() IS NOT NULL;
  v_po record;
  v_amounts record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT po.status INTO v_po FROM public.purchase_orders po WHERE po.id = OLD.purchase_order_id;
    -- Not found = the PO itself is being deleted (cascade); its own guard already decided.
    IF FOUND AND v_end_user AND NOT v_internal AND v_po.status <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'Lines can only be removed while the purchase order is a draft.';
    END IF;
    RETURN OLD;
  END IF;

  SELECT po.id, po.org_id, po.status INTO v_po
  FROM public.purchase_orders po
  WHERE po.id = NEW.purchase_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Purchase order not found.';
  END IF;
  IF NEW.org_id IS DISTINCT FROM v_po.org_id THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'A purchase order line must belong to the same company as its purchase order.';
  END IF;
  IF NEW.product_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id)
     AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = NEW.product_id AND s.org_id = v_po.org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Product does not belong to this company.';
  END IF;

  IF v_end_user AND NOT v_internal THEN
    IF TG_OP = 'INSERT' THEN
      IF v_po.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'Lines can only be added while the purchase order is a draft.';
      END IF;
      NEW.quantity_received := 0;
    ELSE
      NEW.quantity_received := OLD.quantity_received;
      IF NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A line cannot move to another purchase order.';
      END IF;
      IF v_po.status <> 'draft' AND (
        NEW.product_id IS DISTINCT FROM OLD.product_id
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.quantity_ordered IS DISTINCT FROM OLD.quantity_ordered
        OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
        OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
        OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'Lines are locked once a purchase order is approved.';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_amounts
  FROM public.purchase_order_line_amounts(NEW.quantity_ordered, NEW.unit_cost, NEW.discount_percent, NEW.vat_rate);
  NEW.line_subtotal := v_amounts.gross;
  NEW.line_discount := v_amounts.discount;
  NEW.line_vat := v_amounts.vat;
  NEW.line_total := v_amounts.total;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_order_items_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.purchase_order_recalculate(OLD.purchase_order_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id) THEN
    PERFORM public.purchase_order_recalculate(NEW.purchase_order_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_items_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_order_items_rollup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_order_items_guard ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_guard();

DROP TRIGGER IF EXISTS purchase_order_items_rollup ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_rollup();

-- ── expenses guard: supplier payments against a PO ────────────────────────────────────────────
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
  -- Category, notes, reference edits on an existing payment need no re-check.
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

  -- Lock the PO so concurrent payments are checked one after another.
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id FOR UPDATE;
  IF NOT FOUND OR v_po.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Purchase order not found for this company.';
  END IF;
  IF v_po.status = 'draft' THEN
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

CREATE OR REPLACE FUNCTION public.expenses_purchase_order_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.purchase_order_id IS NOT NULL THEN
    PERFORM public.purchase_order_refresh_paid(OLD.purchase_order_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.purchase_order_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
          OR NEW.amount IS DISTINCT FROM OLD.amount) THEN
    PERFORM public.purchase_order_refresh_paid(NEW.purchase_order_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.expenses_purchase_order_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expenses_purchase_order_rollup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expenses_purchase_order_guard ON public.expenses;
CREATE TRIGGER expenses_purchase_order_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_purchase_order_guard();

DROP TRIGGER IF EXISTS expenses_purchase_order_rollup ON public.expenses;
CREATE TRIGGER expenses_purchase_order_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_purchase_order_rollup();

-- ── Receiving: partial receipts, free-text lines ──────────────────────────────────────────────
-- Same signature as 20260913140000. Changes: accepts partially_received POs, free-text lines (no
-- product) receive without a stock movement, the PO moves to partially_received / received, and
-- p_unit_cost NULL values stock at the line's net unit price.
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

  SELECT poi.*, po.id AS po_id
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
      updated_at = now()
  WHERE id = v_po_id;

  PERFORM set_config('paidly.po_internal', v_prev, true);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order_item(uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_item(uuid, uuid, numeric, numeric)
  TO authenticated, service_role;

-- ── Supplier payment → expense, in one call ───────────────────────────────────────────────────
-- SECURITY INVOKER: the caller's RLS decides whether they can see the PO (owners/managers) and
-- write the expense; expenses_purchase_order_guard enforces the amount owed.
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
  IF v_method NOT IN ('cash', 'eft', 'bank_transfer', 'card', 'credit_card', 'debit_card', 'other') THEN
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

COMMENT ON FUNCTION public.record_purchase_order_payment IS
  'Records a supplier payment against an approved PO as an expense (capture_source purchase_order). '
  'SECURITY INVOKER; idempotent on p_client_operation_id; overpayment refused by expenses_purchase_order_guard.';

-- ── Backfill existing purchase orders ─────────────────────────────────────────────────────────
-- Existing lines had no VAT or discount notion: vat_rate/discount_percent stay 0, so their totals
-- equal quantity × unit cost exactly as the old "Estimated total" showed.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('paidly.po_internal', 'on', true);

  UPDATE public.purchase_order_items i
  SET line_subtotal = a.gross, line_discount = a.discount, line_vat = a.vat, line_total = a.total
  FROM public.purchase_order_items src
  CROSS JOIN LATERAL public.purchase_order_line_amounts(
    src.quantity_ordered, src.unit_cost, src.discount_percent, src.vat_rate) a
  WHERE src.id = i.id;

  UPDATE public.purchase_orders po
  SET status = 'partially_received'
  WHERE po.status = 'approved'
    AND EXISTS (SELECT 1 FROM public.purchase_order_items i WHERE i.purchase_order_id = po.id AND i.quantity_received > 0);

  FOR r IN SELECT id FROM public.purchase_orders LOOP
    PERFORM public.purchase_order_recalculate(r.id);
  END LOOP;

  PERFORM set_config('paidly.po_internal', '', true);
END $$;
