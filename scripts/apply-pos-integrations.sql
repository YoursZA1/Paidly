-- Apply POS integration tables (run once in Supabase → SQL Editor).
-- Combines:
--   supabase/migrations/20260709180000_pos_integrations.sql
--   supabase/migrations/20260709183000_pos_oauth_states.sql
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- Requires public.is_org_member(uuid) from migration 20260624120000_fix_org_membership_rls_recursion.sql

-- ── pos_connections + pos_sales_events ────────────────────────────────────────

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
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS "pos_sales_events_org_select" ON public.pos_sales_events;
CREATE POLICY "pos_sales_events_org_select"
  ON public.pos_sales_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text, text, uuid) TO service_role;

GRANT ALL ON TABLE public.pos_connections TO service_role;
GRANT ALL ON TABLE public.pos_sales_events TO service_role;
GRANT ALL ON TABLE public.pos_oauth_states TO service_role;

-- ── pos_oauth_states (Square OAuth CSRF) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pos_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('square', 'yoco')),
  state_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_oauth_states_expires_at ON public.pos_oauth_states(expires_at);

ALTER TABLE public.pos_oauth_states ENABLE ROW LEVEL SECURITY;

-- Notify PostgREST to reload schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';

-- If DELETE /api/pos/connections/:id fails with FK errors, also run:
-- supabase/migrations/20260709190000_pos_sales_events_cascade_delete.sql
-- supabase/migrations/20260709191000_pos_delete_connection_rpc.sql

CREATE OR REPLACE FUNCTION public.delete_pos_connection(
  p_org_id uuid,
  p_connection_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted boolean := false;
BEGIN
  IF p_org_id IS NULL OR p_connection_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.pos_sales_events
  WHERE connection_id = p_connection_id;

  DELETE FROM public.pos_connections
  WHERE id = p_connection_id
    AND org_id = p_org_id
  RETURNING true INTO deleted;

  RETURN COALESCE(deleted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_pos_connection(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pos_connection(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
