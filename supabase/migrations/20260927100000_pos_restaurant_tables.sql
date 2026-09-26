-- Paidly POS restaurant mode (V1): floors, tables, running table tabs, kitchen tickets (KOT/KDS),
-- and bill portions.
--
-- Architecture (no second payment or sales system):
--   Floor → Table → Tab (one open tab per table) → items sent in rounds → kitchen tickets per station
--   Pay (full / split) → payment_intents (Payment Engine) → settlePosIntent → pos_sales_events → stock
--   pos_tab_payments only LINKS a bill portion to its payment_intent; the intent is the money truth.
--
-- Writes go through the API (service role) so POS permissions, register sessions and the Payment
-- Engine rules apply. Org members may read.
--
-- Roll back: DROP TABLE pos_tab_payments, pos_kitchen_tickets, pos_tab_items, pos_tabs, pos_tables,
--            pos_floors; ALTER TABLE services DROP COLUMN pos_station; restore the business_type check.
-- Idempotent.

-- ── Business type: restaurant / café / bar ─────────────────────────────────────────────
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_business_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_type_check
  CHECK (business_type IS NULL OR business_type IN ('service', 'retail', 'mixed', 'restaurant'));

COMMENT ON COLUMN public.organizations.business_type IS
  'How the tenant sells: service (documents only), retail (POS counter), mixed (documents + POS), restaurant (POS with floors, tables and kitchen). NULL is treated as service — POS stays off.';

-- ── Kitchen station per catalog item (Kitchen, Bar, or a custom station) ───────────────
DO $$
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.services ADD COLUMN IF NOT EXISTS pos_station text';
    EXECUTE $c$COMMENT ON COLUMN public.services.pos_station IS
      'Restaurant POS: which kitchen station prepares this item (e.g. kitchen, bar). NULL = kitchen.'$c$;
  END IF;
END $$;

-- ── Floors ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_floors_name_not_blank CHECK (char_length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_floors_org_name ON public.pos_floors (org_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_pos_floors_org ON public.pos_floors (org_id, sort_order);

-- ── Tables (grid position for the floor plan) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES public.pos_floors(id) ON DELETE CASCADE,
  name text NOT NULL,
  seats integer NOT NULL DEFAULT 2 CHECK (seats BETWEEN 1 AND 99),
  shape text NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'long')),
  pos_x integer NOT NULL DEFAULT 0 CHECK (pos_x BETWEEN 0 AND 23),
  pos_y integer NOT NULL DEFAULT 0 CHECK (pos_y BETWEEN 0 AND 23),
  is_active boolean NOT NULL DEFAULT true,
  cleaning_since timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_tables_name_not_blank CHECK (char_length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tables_floor_name ON public.pos_tables (floor_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_pos_tables_org ON public.pos_tables (org_id, floor_id);

-- ── Tabs: one running order per table session (also takeaway orders without a table) ───
CREATE TABLE IF NOT EXISTS public.pos_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid,
  register_id uuid REFERENCES public.pos_registers(id) ON DELETE SET NULL,
  table_id uuid REFERENCES public.pos_tables(id) ON DELETE SET NULL,
  order_type text NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway')),
  order_number integer NOT NULL CHECK (order_number > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'void')),
  guests integer CHECK (guests IS NULL OR guests BETWEEN 1 AND 999),
  server_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  server_name text,
  customer_name text,
  client_id uuid,
  note text,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  service_charge_rate numeric(6, 3) NOT NULL DEFAULT 0 CHECK (service_charge_rate >= 0 AND service_charge_rate <= 100),
  bill_requested_at timestamptz,
  merged_into uuid REFERENCES public.pos_tabs(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_tabs_table_for_dine_in CHECK (order_type <> 'dine_in' OR table_id IS NOT NULL OR status <> 'open')
);
-- One table = one open order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tabs_one_open_per_table
  ON public.pos_tabs (table_id) WHERE status = 'open' AND table_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tabs_org_order_number ON public.pos_tabs (org_id, order_number);
CREATE INDEX IF NOT EXISTS idx_pos_tabs_org_status ON public.pos_tabs (org_id, status, opened_at DESC);

-- ── Tab items (pending until sent; sent items belong to a kitchen ticket) ──────────────
CREATE TABLE IF NOT EXISTS public.pos_kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.pos_tabs(id) ON DELETE CASCADE,
  ticket_number text NOT NULL,
  round integer NOT NULL CHECK (round > 0),
  station text NOT NULL DEFAULT 'kitchen',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'void')),
  table_label text,
  order_type text,
  server_name text,
  note text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_tickets_live ON public.pos_kitchen_tickets (org_id, status, sent_at);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_tickets_tab ON public.pos_kitchen_tickets (tab_id);

CREATE TABLE IF NOT EXISTS public.pos_tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.pos_tabs(id) ON DELETE CASCADE,
  product_id uuid,
  name text NOT NULL,
  quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  note text,
  station text NOT NULL DEFAULT 'kitchen',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'void')),
  kot_id uuid REFERENCES public.pos_kitchen_tickets(id) ON DELETE SET NULL,
  round integer,
  void_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_tab_items_tab ON public.pos_tab_items (tab_id, status);

-- ── Bill portions → payment intents (full bill, split equally / by item / by amount) ───
DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NULL THEN
    RAISE EXCEPTION 'payment_intents missing — apply 20260828180000_payment_intents.sql first';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pos_tab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.pos_tabs(id) ON DELETE CASCADE,
  payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  label text,
  split_kind text NOT NULL DEFAULT 'full' CHECK (split_kind IN ('full', 'equal', 'items', 'amount')),
  allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tab_payments_intent ON public.pos_tab_payments (payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_pos_tab_payments_tab ON public.pos_tab_payments (tab_id);

COMMENT ON TABLE public.pos_tabs IS
  'Restaurant POS running order: one open tab per table; items are added in rounds and sent to the kitchen. Money is never stored here — see pos_tab_payments → payment_intents.';
COMMENT ON TABLE public.pos_tab_payments IS
  'Links a bill portion to its payment_intent. Status/amount truth stays on payment_intents; the paid sale lands in pos_sales_events via settlePosIntent.';

-- ── RLS: org members read; writes via the API (service role) only ──────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_floors', 'pos_tables', 'pos_tabs', 'pos_tab_items', 'pos_kitchen_tickets', 'pos_tab_payments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id))',
      t || '_org_select', t
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;
