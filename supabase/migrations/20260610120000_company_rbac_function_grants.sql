-- Company RBAC helpers are referenced from RLS policies (memberships, documents, payslips,
-- user_company_roles, organizations). Without EXECUTE for authenticated, PostgREST returns:
--   permission denied for function is_company_admin_for_org
--
-- Helpers are created in 20260606120000_company_role_dashboard_rls.sql.
-- is_company_admin_for_org is extended in 20260618120000_company_admin_owner_rls.sql
-- (that migration re-applies EXECUTE for the replaced function).

GRANT USAGE ON SCHEMA public TO authenticated;

-- Called directly in document/payslip write policies alongside company helpers.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_company_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_primary_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company_role_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_manager_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_document_row(public.documents) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_payslip_row(public.payslips) TO authenticated;
