-- Ensure POS sales rows cascade when a connection is deleted.
-- Run in Supabase SQL Editor if DELETE /api/pos/connections/:id fails with FK errors.

ALTER TABLE public.pos_sales_events
  DROP CONSTRAINT IF EXISTS pos_sales_events_connection_id_fkey;

ALTER TABLE public.pos_sales_events
  ADD CONSTRAINT pos_sales_events_connection_id_fkey
  FOREIGN KEY (connection_id)
  REFERENCES public.pos_connections(id)
  ON DELETE CASCADE;

GRANT ALL ON TABLE public.pos_connections TO service_role;
GRANT ALL ON TABLE public.pos_sales_events TO service_role;
GRANT ALL ON TABLE public.pos_oauth_states TO service_role;

NOTIFY pgrst, 'reload schema';
