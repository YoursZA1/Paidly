-- Company RBAC helpers are referenced from RLS policies (memberships, documents, payslips).
-- Without EXECUTE for authenticated, PostgREST returns:
--   permission denied for function is_company_admin_for_org

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_company_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_primary_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company_role_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_manager_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_document_row(public.documents) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_payslip_row(public.payslips) TO authenticated;
