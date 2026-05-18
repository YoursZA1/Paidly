-- adjust_inventory_stock was never explicitly GRANTed to authenticated.
-- Supabase defaults grant EXECUTE on public functions to authenticated, but being
-- explicit here ensures the function stays callable after any future privilege audits
-- or REVOKE ALL sweeps.

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.adjust_inventory_stock IS
  'Atomic stock +/- with movement log. SECURITY INVOKER (runs as caller). GRANT: authenticated.';
