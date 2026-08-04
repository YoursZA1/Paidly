-- Supplier master table for the Purchase Order module.
-- Deliberately separate from the `Vendor` entity: Vendor has no backing
-- Postgres table (lives only in localStorage) and its fields are
-- expense-categorization-oriented, unrelated to procurement.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  tax_number text,
  payment_terms text,
  lead_time_days integer,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON public.suppliers(org_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin full access suppliers" ON public.suppliers
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "org members select suppliers" ON public.suppliers
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = suppliers.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members write suppliers" ON public.suppliers
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = suppliers.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members update suppliers" ON public.suppliers
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = suppliers.org_id AND m.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = suppliers.org_id AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "org members delete suppliers" ON public.suppliers
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = suppliers.org_id AND m.user_id = (SELECT auth.uid())
  ));
