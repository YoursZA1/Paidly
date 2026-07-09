-- Atomic POS connection delete (sales rows + connection) for service_role API.
-- Run in Supabase SQL Editor if DELETE /api/pos/connections/:id fails.

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
