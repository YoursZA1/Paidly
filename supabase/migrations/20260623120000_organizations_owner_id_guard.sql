-- Harden organizations against ownership seizure by non-owner company admins.
--
-- Context: organizations_admin_update_profile (20260619120000) grants UPDATE to ANY
-- company admin, and an RLS WITH CHECK clause cannot pin a specific column value. A
-- non-owner admin could therefore run `UPDATE organizations SET owner_id = <self>`
-- directly via PostgREST and seize the org (owner outranks admin: can delete the org and
-- cannot be demoted by admins). The JS service layer (updateOrganizationProfile) uses a
-- column allow-list that excludes owner_id, but RLS — not the client — is the security
-- boundary, so a crafted request bypasses it.
--
-- Legitimate ownership transfer happens ONLY inside SECURITY DEFINER functions
-- (accept_company_invite_token, handle_new_user) or via service_role. This guard is
-- SECURITY INVOKER so current_user reflects the real caller: 'authenticated'/'anon' for a
-- direct PostgREST request (blocked), the function owner for a SECURITY DEFINER transfer
-- (allowed), and 'service_role' for server-side admin writes (allowed).

CREATE OR REPLACE FUNCTION public.guard_organizations_owner_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION
      'owner_id cannot be changed by a direct request; ownership transfer is server-managed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_organizations_owner_id() IS
  'Blocks owner_id changes from direct authenticated/anon writes; allows SECURITY DEFINER transfer flows and service_role.';

DROP TRIGGER IF EXISTS organizations_owner_id_guard ON public.organizations;
CREATE TRIGGER organizations_owner_id_guard
  BEFORE UPDATE OF owner_id ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_organizations_owner_id();
