-- Role helpers return true or false, never NULL (2026-10-09).
--
-- user_company_role_for_org() is NULL for someone with no active membership (an outsider, or a disabled /
-- revoked member). That NULL flowed into is_company_manager_for_org(), is_company_admin_for_org() and
-- can_view_org_financials(). can_read_org_financial_row() was also NULL for an active employee whenever
-- one of the row's owner columns was NULL (`NULL = auth.uid()` is NULL, not false).
--
-- RLS treats NULL as "no", so policies were unaffected. plpgsql guards are not: `IF NOT <NULL> THEN RAISE`
-- does not raise. Proven on the replayed schema:
--   * convert_quote_to_invoice() passes NULL as row_created_by_id, so its check was NULL for every
--     non-manager employee: any employee could convert any quote in their business into an invoice,
--     including quotes RLS hides from them.
--   * expenses_purchase_order_guard() "Only owners and managers can record supplier payments" did not
--     fire for an outsider (RLS still refused the row afterwards).
--
-- Each function keeps its latest body; the only change is the coalesce. No policy negates or compares
-- these helpers, so NULL → false changes no policy result. Grants are kept by CREATE OR REPLACE.
--
-- Rollback: re-run the previous definitions from 20260606120000 (is_company_manager_for_org),
-- 20260618120000 (is_company_admin_for_org), 20260928120000 (can_view_org_financials) and
-- 20260928140000 (can_read_org_financial_row).

CREATE OR REPLACE FUNCTION public.is_company_manager_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.user_company_role_for_org(target_org_id) IN ('admin', 'manager'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.user_company_role_for_org(target_org_id) = 'admin', false)
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_org_id
        AND o.owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_org_financials(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(target_org_id IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = target_org_id AND o.owner_id = auth.uid()
    )
    OR (
      public.is_company_manager_for_org(target_org_id)
      AND NOT public.is_pos_only_staff_for_org(target_org_id)
    )
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.can_read_org_financial_row(
  target_org_id uuid,
  row_user_id uuid DEFAULT NULL,
  row_created_by uuid DEFAULT NULL,
  row_created_by_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    public.is_org_member(target_org_id)
    AND NOT public.is_pos_only_staff_for_org(target_org_id)
    AND (
      public.is_admin()
      OR public.can_view_org_financials(target_org_id)
      OR row_user_id = auth.uid()
      OR row_created_by = auth.uid()
      OR row_created_by_id = auth.uid()
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_view_org_financials(uuid) IS
  'Owner, company admin/manager of THIS org, or platform admin. Employees, cashiers, outsiders: false (never NULL — safe in plpgsql IF NOT).';
COMMENT ON FUNCTION public.can_read_org_financial_row(uuid, uuid, uuid, uuid) IS
  'Active non-till member who can see org financials or owns the row (user_id / created_by / created_by_id). Never NULL — safe in plpgsql IF NOT.';
