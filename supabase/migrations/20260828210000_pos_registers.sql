-- Native POS register: a till identity on an org brand (public.companies).
-- Paidly has no locations table — do not invent a multi-site model here.
-- Sale SoR stays pos_sales_events. This is not a parallel POS ledger, session, or payments table.

CREATE TABLE IF NOT EXISTS public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  assigned_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_registers_name_not_blank CHECK (char_length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_registers_org_name
  ON public.pos_registers (org_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_pos_registers_org_status
  ON public.pos_registers (org_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_registers_company
  ON public.pos_registers (company_id)
  WHERE company_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pos_registers DROP CONSTRAINT IF EXISTS pos_registers_company_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.pos_registers
        ADD CONSTRAINT pos_registers_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
    $c$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE NOTICE 'pos_sales_events missing — skip register_id';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pos_sales_events ADD COLUMN IF NOT EXISTS register_id uuid';
  EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_register_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_register_id_fkey
      FOREIGN KEY (register_id) REFERENCES public.pos_registers(id) ON DELETE SET NULL
  $c$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_events_register ON public.pos_sales_events (register_id) WHERE register_id IS NOT NULL';
END $$;

ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_registers_org_select" ON public.pos_registers;
CREATE POLICY "pos_registers_org_select"
  ON public.pos_registers
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "pos_registers_org_manage" ON public.pos_registers;
CREATE POLICY "pos_registers_org_manage"
  ON public.pos_registers
  FOR ALL
  TO authenticated
  USING (public.is_company_admin_for_org(org_id))
  WITH CHECK (public.is_company_admin_for_org(org_id));

GRANT ALL ON TABLE public.pos_registers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_registers TO authenticated;

COMMENT ON TABLE public.pos_registers IS
  'Physical till identity. Belongs to org + optional brand (companies). No locations table exists — do not add a site model here. Opening balance is the cash float, not a sale.';

COMMENT ON COLUMN public.pos_registers.company_id IS
  'Brand (public.companies.id). Same trading identity as invoices.company_id.';

COMMENT ON COLUMN public.pos_registers.assigned_staff_id IS
  'Operational assignment. Checkout cashier_id is still the signed-in user.';

COMMENT ON COLUMN public.pos_registers.opening_balance IS
  'Expected cash float in the drawer. Not POS sale money, not invoice payments.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_sales_events' AND column_name = 'register_id'
  ) THEN
    EXECUTE $c$
      COMMENT ON COLUMN public.pos_sales_events.register_id IS
        'Till that recorded this sale. Optional so Yoco/Square ingress still works without a native register.'
    $c$;
  END IF;
END $$;
