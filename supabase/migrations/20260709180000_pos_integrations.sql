-- POS integrations: connections + normalized sales events (Revenue System ingress).
-- Providers: generic webhook, Yoco, Square. Inventory sync via adjust_inventory_stock (source = pos).

CREATE TABLE IF NOT EXISTS public.pos_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('generic', 'yoco', 'square')),
  label text NOT NULL DEFAULT 'POS Connection',
  webhook_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_connections_org_id ON public.pos_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_pos_connections_webhook_token ON public.pos_connections(webhook_token);

CREATE TABLE IF NOT EXISTS public.pos_sales_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.pos_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  total_amount numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  payment_method text,
  occurred_at timestamptz NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_result jsonb,
  inventory_applied boolean NOT NULL DEFAULT false,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sales_events_connection_external_unique UNIQUE (connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_events_org_occurred
  ON public.pos_sales_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_events_connection_id
  ON public.pos_sales_events(connection_id);

ALTER TABLE public.pos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_events ENABLE ROW LEVEL SECURITY;

-- Connections: org members read; company admins / owners (MANAGE_COMPANY_SETTINGS) write.
DROP POLICY IF EXISTS "pos_connections_org_select" ON public.pos_connections;
CREATE POLICY "pos_connections_org_select"
  ON public.pos_connections
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "pos_connections_org_manage" ON public.pos_connections;
CREATE POLICY "pos_connections_org_manage"
  ON public.pos_connections
  FOR ALL
  TO authenticated
  USING (public.is_company_admin_for_org(org_id))
  WITH CHECK (public.is_company_admin_for_org(org_id));

-- Sales: org members can read synced events.
DROP POLICY IF EXISTS "pos_sales_events_org_select" ON public.pos_sales_events;
CREATE POLICY "pos_sales_events_org_select"
  ON public.pos_sales_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

-- Service role ingests webhooks (bypasses RLS). Grant inventory RPC for server-side stock updates.
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text, text, uuid) TO service_role;

GRANT ALL ON TABLE public.pos_connections TO service_role;
GRANT ALL ON TABLE public.pos_sales_events TO service_role;
-- pos_oauth_states is created in 20260709183000_pos_oauth_states.sql (GRANT lives there).

COMMENT ON TABLE public.pos_connections IS
  'Per-org POS webhook connections (generic, Yoco, Square). Webhook URL uses webhook_token.';
COMMENT ON TABLE public.pos_sales_events IS
  'Normalized POS sale events; inventory_applied when stock was decremented via adjust_inventory_stock.';
