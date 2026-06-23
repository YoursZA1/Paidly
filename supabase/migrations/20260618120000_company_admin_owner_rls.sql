-- Treat org owners as company admins in RLS even if membership.role is stale.

CREATE OR REPLACE FUNCTION public.is_company_admin_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_company_role_for_org(target_org_id) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_org_id
        AND o.owner_id = auth.uid()
    );
$$;

-- CREATE OR REPLACE can drop default PUBLIC execute on some Postgres builds; ensure RLS callers keep access.
GRANT EXECUTE ON FUNCTION public.is_company_admin_for_org(uuid) TO authenticated;
