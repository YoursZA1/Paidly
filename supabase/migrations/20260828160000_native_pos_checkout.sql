-- Native Paidly POS: same pos_sales_events + inventory RPC as Yoco/Square ingress.
-- provider 'paidly' is an in-app till, not a webhook connection.
-- Requires pos_connections + pos_sales_events (scripts/apply-pos-integrations.sql).

DO $$
BEGIN
  IF to_regclass('public.pos_connections') IS NULL OR to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE EXCEPTION 'pos_connections/pos_sales_events missing. Run scripts/apply-pos-integrations.sql first, then re-run this file.';
  END IF;
END $$;

ALTER TABLE public.pos_connections
  DROP CONSTRAINT IF EXISTS pos_connections_provider_check;

ALTER TABLE public.pos_connections
  ADD CONSTRAINT pos_connections_provider_check
  CHECK (provider IN ('generic', 'yoco', 'square', 'paidly'));

-- Native till sales are not tied to a webhook connection.
ALTER TABLE public.pos_sales_events
  ALTER COLUMN connection_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_connections_one_paidly_per_org
  ON public.pos_connections (org_id)
  WHERE provider = 'paidly';

ALTER TABLE public.pos_sales_events
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_kind text NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES public.pos_sales_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_tendered numeric(14, 2),
  ADD COLUMN IF NOT EXISTS change_due numeric(14, 2);

DO $$
BEGIN
  IF to_regclass('public.clients') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_client_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.pos_sales_events
        ADD CONSTRAINT pos_sales_events_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL
    $c$;
  END IF;
  IF to_regclass('public.companies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_company_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.pos_sales_events
        ADD CONSTRAINT pos_sales_events_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
    $c$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_sales_events_sale_kind_check'
      AND conrelid = 'public.pos_sales_events'::regclass
  ) THEN
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_sale_kind_check
      CHECK (sale_kind IN ('sale', 'return'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_events_org_receipt
  ON public.pos_sales_events (org_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_events_parent
  ON public.pos_sales_events (parent_event_id)
  WHERE parent_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_events_cashier
  ON public.pos_sales_events (org_id, cashier_id, occurred_at DESC);

COMMENT ON COLUMN public.pos_sales_events.sale_kind IS
  'sale = retail checkout; return = restock against parent_event_id.';
COMMENT ON COLUMN public.pos_connections.provider IS
  'generic | yoco | square (webhook adapters) | paidly (native till).';
