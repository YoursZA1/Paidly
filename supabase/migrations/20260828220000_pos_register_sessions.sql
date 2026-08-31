-- POS register shift sessions (cash drawer), not Auth sessions.
-- Sale SoR stays pos_sales_events. Closed sessions are immutable.
-- If pos_registers is missing (SQL Editor applied this file first), create it here.

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

CREATE TABLE IF NOT EXISTS public.pos_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  register_id uuid NOT NULL REFERENCES public.pos_registers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  cash_sales numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cash_sales >= 0),
  cash_refunds numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cash_refunds >= 0),
  expected_cash numeric(14, 2) NOT NULL DEFAULT 0,
  closing_cash numeric(14, 2) CHECK (closing_cash IS NULL OR closing_cash >= 0),
  variance numeric(14, 2),
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_register_sessions_closed_complete CHECK (
    (status = 'open' AND closed_at IS NULL AND closing_cash IS NULL AND variance IS NULL)
    OR
    (status = 'closed' AND closed_at IS NOT NULL AND closing_cash IS NOT NULL AND variance IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_register_sessions_one_open
  ON public.pos_register_sessions (register_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_pos_register_sessions_org_opened
  ON public.pos_register_sessions (org_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_register_sessions_register
  ON public.pos_register_sessions (register_id, opened_at DESC);

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE NOTICE 'pos_sales_events missing — skip session_id';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pos_sales_events ADD COLUMN IF NOT EXISTS session_id uuid';
  EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_session_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.pos_register_sessions(id) ON DELETE SET NULL
  $c$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_events_session ON public.pos_sales_events (session_id) WHERE session_id IS NOT NULL';
END $$;

ALTER TABLE public.pos_register_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_register_sessions_org_select" ON public.pos_register_sessions;
CREATE POLICY "pos_register_sessions_org_select"
  ON public.pos_register_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "pos_register_sessions_org_write" ON public.pos_register_sessions;
CREATE POLICY "pos_register_sessions_org_write"
  ON public.pos_register_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS "pos_register_sessions_org_update" ON public.pos_register_sessions;
CREATE POLICY "pos_register_sessions_org_update"
  ON public.pos_register_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id) AND status = 'open')
  WITH CHECK (public.is_org_member(org_id));

CREATE OR REPLACE FUNCTION public.pos_register_session_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Completed POS sessions cannot be edited';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'Completed POS sessions cannot be edited';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_pos_register_session_immutable ON public.pos_register_sessions;
CREATE TRIGGER tr_pos_register_session_immutable
BEFORE UPDATE OR DELETE ON public.pos_register_sessions
FOR EACH ROW
EXECUTE FUNCTION public.pos_register_session_immutable();

GRANT ALL ON TABLE public.pos_register_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_register_sessions TO authenticated;

COMMENT ON TABLE public.pos_register_sessions IS
  'Cash-drawer shift on a POS register. Not Auth. Closed rows are immutable. Cash totals snapshot at close from pos_sales_events.';

COMMENT ON COLUMN public.pos_register_sessions.opening_balance IS
  'Cash counted into the drawer when the shift opens. Prefills from pos_registers.opening_balance.';

COMMENT ON COLUMN public.pos_register_sessions.expected_cash IS
  'opening_balance + cash_sales - cash_refunds. Snapshotted at close.';

COMMENT ON COLUMN public.pos_register_sessions.variance IS
  'closing_cash - expected_cash. Set only when the session is closed.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_sales_events' AND column_name = 'session_id'
  ) THEN
    EXECUTE $c$
      COMMENT ON COLUMN public.pos_sales_events.session_id IS
        'Open register shift that recorded this native till sale. External Yoco/Square ingress may omit it.'
    $c$;
  END IF;
END $$;
