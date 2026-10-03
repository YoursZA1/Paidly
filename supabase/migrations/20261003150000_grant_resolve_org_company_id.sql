-- Invoice and quote writes fire enforce_commercial_document_issuer(), which calls
-- resolve_org_company_id() as the session role. That helper is SECURITY DEFINER and
-- EXECUTE is not granted to PUBLIC. A signed-in user or the Payment Engine
-- (service_role) without the grant gets:
--   permission denied for function resolve_org_company_id
--
-- Run the issuer trigger as its owner so the helper call does not depend on the
-- session role, and re-grant EXECUTE for any direct caller.

ALTER FUNCTION public.enforce_commercial_document_issuer() SECURITY DEFINER;
ALTER FUNCTION public.enforce_commercial_document_issuer() SET search_path = public;

REVOKE ALL ON FUNCTION public.resolve_org_company_id(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_org_company_id(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_commercial_document_issuer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_commercial_document_issuer() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
