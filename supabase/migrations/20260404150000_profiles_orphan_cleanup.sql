-- Remove profile rows with no matching auth user (stale admin UI / broken FK environments).
-- Auth remains source of truth; profiles.id should reference auth.users(id).

CREATE OR REPLACE FUNCTION public.admin_delete_orphan_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_orphan_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_orphan_profiles() TO service_role;

-- One-time cleanup on migrate
SELECT public.admin_delete_orphan_profiles();

COMMENT ON FUNCTION public.admin_delete_orphan_profiles() IS
  'Deletes public.profiles rows whose id is not present in auth.users; callable via service role (POST /api/admin/clean-orphaned-users).';
