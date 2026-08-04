-- Purchase Order header + line items.
-- Status lifecycle (draft -> approved -> received, or cancelled) is enforced
-- in the app layer (src/services/PurchaseOrderService.js), matching the
-- existing convention for invoice status transitions (InvoiceSendService.js)
-- rather than DB triggers/constraints.

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'received', 'cancelled')),
  expected_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_org_po_number ON public.purchase_orders(org_id, po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_id ON public.purchase_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);

-- org_id is denormalized onto line items (same precedent as
-- deliveries after 20260518110000_deliveries_schema_hardening.sql) so RLS
-- doesn't need a join back to purchase_orders on every row check.
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.services(id),
  quantity_ordered integer NOT NULL CHECK (quantity_ordered > 0),
  quantity_received integer NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_org_id ON public.purchase_order_items(org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items(product_id);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- purchase_orders
CREATE POLICY "admin full access purchase_orders" ON public.purchase_orders
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "org members select purchase_orders" ON public.purchase_orders
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_orders.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members write purchase_orders" ON public.purchase_orders
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_orders.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members update purchase_orders" ON public.purchase_orders
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_orders.org_id AND m.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_orders.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members delete purchase_orders" ON public.purchase_orders
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_orders.org_id AND m.user_id = (SELECT auth.uid())
  ));

-- purchase_order_items
CREATE POLICY "admin full access purchase_order_items" ON public.purchase_order_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "org members select purchase_order_items" ON public.purchase_order_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_order_items.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members write purchase_order_items" ON public.purchase_order_items
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_order_items.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members update purchase_order_items" ON public.purchase_order_items
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_order_items.org_id AND m.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_order_items.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members delete purchase_order_items" ON public.purchase_order_items
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = purchase_order_items.org_id AND m.user_id = (SELECT auth.uid())
  ));
