-- Paidly POS: counter orders on the restaurant order flow.
--
-- Quick-service counter orders that the kitchen prepares (order at the counter → kitchen → ready →
-- collected, paid before or at collection) are running orders like takeaway, just without a table.
-- Plain counter sales that never reach the kitchen keep using the normal till checkout.
--
-- Also indexes kitchen tickets by (tab, status) for the "serve / collect" action and the orders screen.
--
-- Roll back: ALTER TABLE pos_tabs DROP CONSTRAINT pos_tabs_order_type_check; re-add it with
--            CHECK (order_type IN ('dine_in', 'takeaway')) after closing any open counter tabs;
--            DROP INDEX idx_pos_kitchen_tickets_tab_status.
-- Idempotent.

DO $$
BEGIN
  IF to_regclass('public.pos_tabs') IS NULL THEN
    RAISE EXCEPTION 'pos_tabs missing — apply 20260927100000_pos_restaurant_tables.sql first';
  END IF;
END $$;

ALTER TABLE public.pos_tabs DROP CONSTRAINT IF EXISTS pos_tabs_order_type_check;
ALTER TABLE public.pos_tabs
  ADD CONSTRAINT pos_tabs_order_type_check CHECK (order_type IN ('dine_in', 'takeaway', 'counter'));

CREATE INDEX IF NOT EXISTS idx_pos_kitchen_tickets_tab_status ON public.pos_kitchen_tickets (tab_id, status);

COMMENT ON COLUMN public.pos_tabs.order_type IS
  'dine_in (needs a table while open) · takeaway · counter. Operational stage comes from items and kitchen tickets; payment state from pos_tab_payments → payment_intents.';
