-- Multi-tenant isolation: an employee is associated with a business without becoming its administrator,
-- and the same person can independently own another business without the two contexts leaking.
--
-- Root causes fixed here (all reproduced in tests/unit/tenantIsolation.db.test.js):
--
-- 1. Legacy "any org member" policies were never dropped when role-gated ones were added. Permissive
--    policies are OR'ed, so the role gate did nothing on clients, expenses, payments, banking_details,
--    companies, invoice_items, quote_items, invoice_views, message_logs, document_sends, purchase_orders,
--    suppliers, recurring_invoices, payment_intents/refunds and pos_sales_events. A cashier or general
--    employee could read company revenue (payments, POS sales) and line-item totals even though
--    `invoices` itself returned nothing — the reported dashboard leak.
-- 2. `is_pos_only_staff()` was global: a user who is a cashier at Company A and owns Business B was
--    treated as a cashier in Business B too (locked out of their own invoices, payroll, quote conversion).
--    Every policy/helper now asks the per-org question `is_pos_only_staff_for_org(org_id)`.
-- 3. `can_read_payslip_row` matched `payslips.employee_email` against the caller's editable
--    `profiles.email`. An employee could set their profile email to a colleague's and read their payslips.
--    Authorization is now by ids only (employee_user_id / membership_id / creator).
-- 4. The payslip write policy (FOR ALL, so it also grants SELECT) allowed every manager to read and edit
--    every payslip. Payroll writes now require can_manage_org_payroll (admin/owner or finance manager).
-- 5. Subscription billing rows were readable by any member whose tenant context resolved to the company;
--    they now require company admin.
-- 6. pos_connections (webhook secrets) were readable by every member, cashiers included.
--
-- Nothing here grants new access. Owners/admins/managers keep what they had; POS cashiers keep POS.

-- ---------------------------------------------------------------------------------------------------
-- Per-org role primitives
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_pos_only_staff_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
      AND lower(trim(m.role)) = 'employee'
      AND public.normalize_job_function(m.job_function) = 'pos'
      AND o.owner_id IS DISTINCT FROM auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_pos_only_staff_for_org(uuid) IS
  'True when the caller is a till cashier (employee + job_function pos) in THIS org and does not own it. '
  'A cashier elsewhere is irrelevant here.';

-- Global form kept for callers outside RLS: true only when the caller is a cashier and nothing else
-- (no non-POS membership, owns no business). A cashier who also owns a business is not "POS only".
CREATE OR REPLACE FUNCTION public.is_pos_only_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.user_id = auth.uid()
      AND lower(trim(m.role)) = 'employee'
      AND public.normalize_job_function(m.job_function) = 'pos'
      AND o.owner_id IS DISTINCT FROM auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND NOT (
        lower(trim(m.role)) = 'employee'
        AND public.normalize_job_function(m.job_function) = 'pos'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.owner_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_pos_only_staff() IS
  'True when the caller is only a till cashier (every membership is employee+pos, owns no org). '
  'RLS uses is_pos_only_staff_for_org(org_id) instead.';

-- Company-level financial visibility (revenue, payments, expenses, ledgers, all invoices/quotes).
CREATE OR REPLACE FUNCTION public.can_view_org_financials(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_org_id IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = target_org_id AND o.owner_id = auth.uid()
    )
    OR (
      public.is_company_manager_for_org(target_org_id)
      AND NOT public.is_pos_only_staff_for_org(target_org_id)
    )
  );
$$;

COMMENT ON FUNCTION public.can_view_org_financials(uuid) IS
  'Owner, company admin/manager of THIS org, or platform admin. Employees and cashiers: false.';

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
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = auth.uid()
  )
  AND NOT public.is_pos_only_staff_for_org(target_org_id)
  AND (
    public.is_admin()
    OR public.can_view_org_financials(target_org_id)
    OR row_user_id = auth.uid()
    OR row_created_by = auth.uid()
    OR row_created_by_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.can_read_org_financial_row(uuid, uuid, uuid, uuid) IS
  'Owner/admin/manager of the row''s org see all rows; employees see only rows they own/created; '
  'cashiers of that org see none. Per-org: a cashier elsewhere keeps full access to their own business.';

-- Row-level helpers for child tables keyed by a parent invoice/quote id (no nested RLS, explicit check).
CREATE OR REPLACE FUNCTION public.can_read_invoice_id(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND public.can_read_org_financial_row(i.org_id, i.user_id, i.created_by, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_invoice_id(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND public.can_read_org_financial_row(i.org_id, i.user_id, i.created_by, NULL)
      AND (
        public.is_admin()
        OR public.can_view_org_financials(i.org_id)
        OR i.user_id = auth.uid()
        OR i.created_by = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_quote_id(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = p_quote_id
      AND public.can_read_org_financial_row(q.org_id, q.user_id, q.created_by, NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_quote_id(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = p_quote_id
      AND public.can_read_org_financial_row(q.org_id, q.user_id, q.created_by, NULL)
      AND (
        public.is_admin()
        OR public.can_view_org_financials(q.org_id)
        OR q.user_id = auth.uid()
        OR q.created_by = auth.uid()
      )
  );
$$;

-- Send/view/tracking logs follow the document they describe.
CREATE OR REPLACE FUNCTION public.can_read_commercial_document(
  p_org_id uuid,
  p_document_type text,
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_view_org_financials(p_org_id)
    OR (
      lower(coalesce(p_document_type, '')) = 'invoice'
      AND p_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = p_document_id AND i.org_id = p_org_id
      )
      AND public.can_read_invoice_id(p_document_id)
    )
    OR (
      lower(coalesce(p_document_type, '')) = 'quote'
      AND p_document_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = p_document_id AND q.org_id = p_org_id
      )
      AND public.can_read_quote_id(p_document_id)
    );
$$;

-- ---------------------------------------------------------------------------------------------------
-- Payroll helpers: per-org cashier check, no email matching
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_payroll_admin_for_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_admin_for_org(target_org_id)
    AND NOT public.is_pos_only_staff_for_org(target_org_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_payroll(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_company_admin_for_org(target_org_id)
    OR (
      public.user_company_role_for_org(target_org_id) = 'manager'
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = target_org_id
          AND m.user_id = auth.uid()
          AND public.normalize_job_function(m.job_function) = 'finance'
      )
      AND NOT public.is_pos_only_staff_for_org(target_org_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_see_org_workforce(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_company_admin_for_org(target_org_id)
    OR public.can_manage_org_payroll(target_org_id)
    OR (
      public.user_company_role_for_org(target_org_id) = 'manager'
      AND EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = target_org_id
          AND m.user_id = auth.uid()
          AND public.normalize_job_function(m.job_function) = 'hr'
      )
      AND NOT public.is_pos_only_staff_for_org(target_org_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_payslip_row(p public.payslips)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = p.org_id
      AND m.user_id = auth.uid()
  )
  AND (
    public.is_admin()
    OR public.is_company_admin_for_org(p.org_id)
    OR public.can_manage_org_payroll(p.org_id)
    OR p.employee_user_id = auth.uid()
    OR p.user_id = auth.uid()
    OR p.created_by_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships own
      WHERE own.id = p.membership_id
        AND own.org_id = p.org_id
        AND own.user_id = auth.uid()
        AND NOT public.is_pos_only_staff_for_org(p.org_id)
    )
  );
$$;

COMMENT ON FUNCTION public.can_read_payslip_row(public.payslips) IS
  'Payroll admins of the org, or the employee the payslip belongs to (by auth id / membership id). '
  'Never by email: profiles.email is user-editable.';

CREATE OR REPLACE FUNCTION public.enforce_pos_customer_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_pos_only_staff_for_org(NEW.org_id) THEN
    NEW.pos_enabled := true;
    NEW.internal_notes := NULL;
    NEW.notes := NULL;
    NEW.tax_id := NULL;
    NEW.fax := NULL;
    NEW.alternate_email := NULL;
    NEW.website := NULL;
    NEW.address := NULL;
    NEW.industry := NULL;
    NEW.contact_person := NULL;
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_id := COALESCE(NEW.created_by_id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- invoices / quotes: cashiers of the org cannot write them from the client either
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members write invoices" ON public.invoices;
CREATE POLICY "org members write invoices" ON public.invoices
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, user_id, created_by, NULL)
    AND (public.is_admin() OR public.can_view_org_financials(org_id)
         OR user_id = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND NOT public.is_pos_only_staff_for_org(org_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id)
         OR user_id = auth.uid() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "org members write quotes" ON public.quotes;
CREATE POLICY "org members write quotes" ON public.quotes
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, user_id, created_by, NULL)
    AND (public.is_admin() OR public.can_view_org_financials(org_id)
         OR user_id = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND NOT public.is_pos_only_staff_for_org(org_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id)
         OR user_id = auth.uid() OR created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------------------------------
-- invoice_items / quote_items: follow the parent document, not org membership
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "org members write invoice items" ON public.invoice_items;
CREATE POLICY "org members select invoice items" ON public.invoice_items
  FOR SELECT USING (public.can_read_invoice_id(invoice_id));
CREATE POLICY "org members write invoice items" ON public.invoice_items
  FOR ALL
  USING (public.can_write_invoice_id(invoice_id))
  WITH CHECK (public.can_write_invoice_id(invoice_id));

DROP POLICY IF EXISTS "org members select quote items" ON public.quote_items;
DROP POLICY IF EXISTS "org members write quote items" ON public.quote_items;
CREATE POLICY "org members select quote items" ON public.quote_items
  FOR SELECT USING (public.can_read_quote_id(quote_id));
CREATE POLICY "org members write quote items" ON public.quote_items
  FOR ALL
  USING (public.can_write_quote_id(quote_id))
  WITH CHECK (public.can_write_quote_id(quote_id));

-- ---------------------------------------------------------------------------------------------------
-- clients: drop the legacy any-member policies; cashier checkout policies become per-org
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select" ON public.clients;
DROP POLICY IF EXISTS "org members write" ON public.clients;
DROP POLICY IF EXISTS "pos staff select clients for checkout" ON public.clients;

DROP POLICY IF EXISTS "org members write clients" ON public.clients;
CREATE POLICY "org members write clients" ON public.clients
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, NULL, NULL, created_by_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id) OR created_by_id = auth.uid())
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND NOT public.is_pos_only_staff_for_org(org_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id) OR created_by_id = auth.uid())
  );

DROP POLICY IF EXISTS "pos staff select pos customers" ON public.clients;
CREATE POLICY "pos staff select pos customers" ON public.clients
  FOR SELECT
  USING (public.is_pos_only_staff_for_org(org_id) AND pos_enabled = true);

DROP POLICY IF EXISTS "pos staff insert pos customers" ON public.clients;
CREATE POLICY "pos staff insert pos customers" ON public.clients
  FOR INSERT
  WITH CHECK (
    public.is_pos_only_staff_for_org(org_id)
    AND pos_enabled = true
    AND COALESCE(created_by_id, auth.uid()) = auth.uid()
  );

DROP POLICY IF EXISTS "pos staff update own pos customers" ON public.clients;
CREATE POLICY "pos staff update own pos customers" ON public.clients
  FOR UPDATE
  USING (public.is_pos_only_staff_for_org(org_id) AND pos_enabled = true AND created_by_id = auth.uid())
  WITH CHECK (public.is_pos_only_staff_for_org(org_id) AND pos_enabled = true AND created_by_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------
-- Company money: expenses, payments, payment intents/refunds
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select expenses" ON public.expenses;
DROP POLICY IF EXISTS "org members write expenses" ON public.expenses;
CREATE POLICY "org members select expenses" ON public.expenses
  FOR SELECT USING (public.can_read_org_financial_row(org_id, NULL, NULL, created_by_id));
CREATE POLICY "org members write expenses" ON public.expenses
  FOR ALL
  USING (
    public.can_read_org_financial_row(org_id, NULL, NULL, created_by_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id) OR created_by_id = auth.uid())
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND NOT public.is_pos_only_staff_for_org(org_id)
    AND (public.is_admin() OR public.can_view_org_financials(org_id) OR created_by_id = auth.uid())
  );

DROP POLICY IF EXISTS "org members select payments" ON public.payments;
CREATE POLICY "org members select payments" ON public.payments
  FOR SELECT
  USING (
    public.can_view_org_financials(org_id)
    OR (
      invoice_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = payments.invoice_id AND i.org_id = payments.org_id)
      AND public.can_read_invoice_id(invoice_id)
    )
  );

DROP POLICY IF EXISTS payment_intents_org_select ON public.payment_intents;
CREATE POLICY payment_intents_org_select ON public.payment_intents
  FOR SELECT TO authenticated
  USING (
    public.can_view_org_financials(org_id)
    OR (created_by = auth.uid() AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS payment_refunds_org_select ON public.payment_refunds;
CREATE POLICY payment_refunds_org_select ON public.payment_refunds
  FOR SELECT TO authenticated
  USING (public.can_view_org_financials(org_id));

-- ---------------------------------------------------------------------------------------------------
-- Company settings: banking details, brands, catalog writes, packages
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select banking_details" ON public.banking_details;
DROP POLICY IF EXISTS "org members write banking_details" ON public.banking_details;
DROP POLICY IF EXISTS "org members update banking_details" ON public.banking_details;
DROP POLICY IF EXISTS "org members delete banking_details" ON public.banking_details;
-- Printed on every outbound invoice, so staff who issue invoices may read it; only admins change it.
CREATE POLICY "org members select banking_details" ON public.banking_details
  FOR SELECT USING (public.is_org_member(org_id) AND NOT public.is_pos_only_staff_for_org(org_id));
CREATE POLICY "company admins insert banking_details" ON public.banking_details
  FOR INSERT WITH CHECK (public.is_company_admin_for_org(org_id));
CREATE POLICY "company admins update banking_details" ON public.banking_details
  FOR UPDATE USING (public.is_company_admin_for_org(org_id)) WITH CHECK (public.is_company_admin_for_org(org_id));
CREATE POLICY "company admins delete banking_details" ON public.banking_details
  FOR DELETE USING (public.is_company_admin_for_org(org_id));

DROP POLICY IF EXISTS "org members insert companies" ON public.companies;
DROP POLICY IF EXISTS "org members update companies" ON public.companies;
DROP POLICY IF EXISTS "org members delete companies" ON public.companies;
CREATE POLICY "company admins insert companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (public.is_company_admin_for_org(org_id));
CREATE POLICY "company admins update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_company_admin_for_org(org_id)) WITH CHECK (public.is_company_admin_for_org(org_id));
CREATE POLICY "company admins delete companies" ON public.companies
  FOR DELETE TO authenticated USING (public.is_company_admin_for_org(org_id));

-- Catalog stays readable by every member (tills sell from it); cashiers change stock via the server.
DROP POLICY IF EXISTS "org members write services" ON public.services;
CREATE POLICY "org members write services" ON public.services
  FOR ALL
  USING (public.is_org_member(org_id) AND NOT public.is_pos_only_staff_for_org(org_id))
  WITH CHECK (public.is_org_member(org_id) AND NOT public.is_pos_only_staff_for_org(org_id));

DROP POLICY IF EXISTS "packages insert admin or org" ON public.packages;
DROP POLICY IF EXISTS "packages update admin or org" ON public.packages;
DROP POLICY IF EXISTS "packages delete admin or org" ON public.packages;
CREATE POLICY "packages insert admin or org" ON public.packages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (org_id IS NOT NULL AND public.can_view_org_financials(org_id)));
CREATE POLICY "packages update admin or org" ON public.packages
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR (org_id IS NOT NULL AND public.can_view_org_financials(org_id)))
  WITH CHECK (public.is_admin() OR (org_id IS NOT NULL AND public.can_view_org_financials(org_id)));
CREATE POLICY "packages delete admin or org" ON public.packages
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (org_id IS NOT NULL AND public.can_view_org_financials(org_id)));

-- ---------------------------------------------------------------------------------------------------
-- Document engagement logs follow the document
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members select invoice_views" ON public.invoice_views;
DROP POLICY IF EXISTS "org members write invoice_views" ON public.invoice_views;
CREATE POLICY "org members select invoice_views" ON public.invoice_views
  FOR SELECT USING (public.can_view_org_financials(org_id) OR public.can_read_invoice_id(invoice_id));
CREATE POLICY "org members write invoice_views" ON public.invoice_views
  FOR ALL
  USING (public.can_view_org_financials(org_id) OR public.can_write_invoice_id(invoice_id))
  WITH CHECK (
    public.is_org_member(org_id)
    AND (public.can_view_org_financials(org_id) OR public.can_write_invoice_id(invoice_id))
  );

DROP POLICY IF EXISTS "org members select message_logs" ON public.message_logs;
DROP POLICY IF EXISTS "org members insert message_logs" ON public.message_logs;
DROP POLICY IF EXISTS "org members update message_logs" ON public.message_logs;
DROP POLICY IF EXISTS "org members delete message_logs" ON public.message_logs;
CREATE POLICY "org members select message_logs" ON public.message_logs
  FOR SELECT USING (public.can_read_commercial_document(org_id, document_type, document_id));
CREATE POLICY "org members insert message_logs" ON public.message_logs
  FOR INSERT WITH CHECK (
    public.is_org_member(org_id) AND public.can_read_commercial_document(org_id, document_type, document_id)
  );
CREATE POLICY "org members update message_logs" ON public.message_logs
  FOR UPDATE USING (public.can_read_commercial_document(org_id, document_type, document_id));
CREATE POLICY "org members delete message_logs" ON public.message_logs
  FOR DELETE USING (public.can_view_org_financials(org_id));

DROP POLICY IF EXISTS "org members select document_sends" ON public.document_sends;
DROP POLICY IF EXISTS "org members insert document_sends" ON public.document_sends;
DROP POLICY IF EXISTS "org members update document_sends" ON public.document_sends;
DROP POLICY IF EXISTS "org members delete document_sends" ON public.document_sends;
DROP POLICY IF EXISTS document_sends_org_select ON public.document_sends;
DROP POLICY IF EXISTS document_sends_org_insert ON public.document_sends;
DROP POLICY IF EXISTS document_sends_org_update ON public.document_sends;
DROP POLICY IF EXISTS document_sends_org_delete ON public.document_sends;
CREATE POLICY document_sends_org_select ON public.document_sends
  FOR SELECT USING (public.can_read_commercial_document(org_id, document_type, document_id));
CREATE POLICY document_sends_org_insert ON public.document_sends
  FOR INSERT WITH CHECK (
    public.is_org_member(org_id) AND public.can_read_commercial_document(org_id, document_type, document_id)
  );
CREATE POLICY document_sends_org_update ON public.document_sends
  FOR UPDATE USING (public.can_read_commercial_document(org_id, document_type, document_id));
CREATE POLICY document_sends_org_delete ON public.document_sends
  FOR DELETE USING (public.can_view_org_financials(org_id));

-- Client timeline carries invoice/payment amounts: same audience as client notes.
DROP POLICY IF EXISTS "org members select client relationship events" ON public.client_relationship_events;
CREATE POLICY "org members select client relationship events" ON public.client_relationship_events
  FOR SELECT USING (public.is_client_timeline_editor(org_id));

-- ---------------------------------------------------------------------------------------------------
-- Recurring billing, purchasing, suppliers: managers only
-- ---------------------------------------------------------------------------------------------------

-- "org members write recurring_invoices" (FOR ALL, manager-gated) already covers update/delete; these
-- two let any member UPDATE/DELETE rows (a bare DELETE never consults the SELECT policy).
DROP POLICY IF EXISTS "org members update recurring_invoices" ON public.recurring_invoices;
DROP POLICY IF EXISTS "org members delete recurring_invoices" ON public.recurring_invoices;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders', 'purchase_order_items', 'suppliers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'org members select ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'org members write ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'org members update ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'org members delete ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.can_view_org_financials(org_id)) '
      'WITH CHECK (public.is_org_member(org_id) AND public.can_view_org_financials(org_id))',
      'org managers manage ' || t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- POS: cashiers keep the till; takings, audit and connection secrets are for POS reporters / admins
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS pos_sales_events_org_select ON public.pos_sales_events;
CREATE POLICY pos_sales_events_org_select ON public.pos_sales_events
  FOR SELECT TO authenticated
  USING (
    public.org_has_pos_permission(org_id, 'pos_view_reports')
    OR (cashier_id = auth.uid() AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS pos_register_sessions_org_select ON public.pos_register_sessions;
CREATE POLICY pos_register_sessions_org_select ON public.pos_register_sessions
  FOR SELECT TO authenticated
  USING (
    public.org_has_pos_permission(org_id, 'pos_view_reports')
    OR (opened_by = auth.uid() AND public.is_org_member(org_id))
  );

DROP POLICY IF EXISTS pos_audit_events_org_select ON public.pos_audit_events;
CREATE POLICY pos_audit_events_org_select ON public.pos_audit_events
  FOR SELECT TO authenticated
  USING (public.org_has_pos_permission(org_id, 'pos_view_reports'));

DROP POLICY IF EXISTS pos_connections_org_select ON public.pos_connections;
CREATE POLICY pos_connections_org_select ON public.pos_connections
  FOR SELECT TO authenticated
  USING (public.is_company_admin_for_org(org_id));

-- ---------------------------------------------------------------------------------------------------
-- Payroll & HR: per-org cashier check; payslip writes need payroll rights, not just "manager"
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "org members write payslips" ON public.payslips;
CREATE POLICY "org members write payslips" ON public.payslips
  FOR ALL
  USING (public.is_org_member(org_id) AND public.can_manage_org_payroll(org_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_manage_org_payroll(org_id));

DROP POLICY IF EXISTS pay_run_items_select ON public.pay_run_items;
CREATE POLICY pay_run_items_select ON public.pay_run_items
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR (user_id = auth.uid() AND NOT public.is_pos_only_staff_for_org(org_id))
  );

DROP POLICY IF EXISTS payroll_profiles_select ON public.payroll_profiles;
CREATE POLICY payroll_profiles_select ON public.payroll_profiles
  FOR SELECT
  USING (
    public.is_admin()
    OR (
      NOT public.is_pos_only_staff_for_org(org_id)
      AND (user_id = auth.uid() OR public.is_company_admin_for_org(org_id))
    )
  );

DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;
CREATE POLICY leave_requests_select ON public.leave_requests
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR (user_id = auth.uid() AND NOT public.is_pos_only_staff_for_org(org_id))
  );

DROP POLICY IF EXISTS leave_balances_select ON public.leave_balances;
CREATE POLICY leave_balances_select ON public.leave_balances
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.payroll_profiles p
      WHERE p.id = leave_balances.payroll_profile_id
        AND p.org_id = leave_balances.org_id
        AND p.user_id = auth.uid()
        AND NOT public.is_pos_only_staff_for_org(leave_balances.org_id)
    )
  );

DROP POLICY IF EXISTS leave_transactions_select ON public.leave_transactions;
CREATE POLICY leave_transactions_select ON public.leave_transactions
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.payroll_profiles p
      WHERE p.id = leave_transactions.payroll_profile_id
        AND p.org_id = leave_transactions.org_id
        AND p.user_id = auth.uid()
        AND NOT public.is_pos_only_staff_for_org(leave_transactions.org_id)
    )
  );

DROP POLICY IF EXISTS attendance_profiles_select ON public.attendance_profiles;
CREATE POLICY attendance_profiles_select ON public.attendance_profiles
  FOR SELECT
  USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = attendance_profiles.employee_id
        AND m.org_id = attendance_profiles.org_id
        AND m.user_id = auth.uid()
        AND NOT public.is_pos_only_staff_for_org(attendance_profiles.org_id)
    )
  );

-- ---------------------------------------------------------------------------------------------------
-- Paidly subscription billing belongs to the company's admins, not every employee
-- ---------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS payment_history_select_company ON public.payment_history;
CREATE POLICY payment_history_select_company ON public.payment_history
  FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
      AND public.is_company_admin_for_org(company_id)
    )
  );

DROP POLICY IF EXISTS subscription_events_select_company ON public.subscription_events;
CREATE POLICY subscription_events_select_company ON public.subscription_events
  FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
      AND public.is_company_admin_for_org(company_id)
    )
  );

DROP POLICY IF EXISTS subscription_invoices_select_company ON public.subscription_invoices;
CREATE POLICY subscription_invoices_select_company ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
      AND public.is_company_admin_for_org(company_id)
    )
  );

DROP POLICY IF EXISTS subscription_dunning_events_select_company ON public.subscription_dunning_events;
CREATE POLICY subscription_dunning_events_select_company ON public.subscription_dunning_events
  FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_dunning_events.subscription_id
        AND s.company_id IS NOT NULL
        AND s.company_id = (SELECT public.current_company_id())
        AND public.is_company_admin_for_org(s.company_id)
    )
  );

-- ---------------------------------------------------------------------------------------------------
-- Grants: helpers are for signed-in RLS only; the trigger helper is not a client RPC
-- ---------------------------------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_pos_only_staff_for_org(uuid)',
    'public.is_pos_only_staff()',
    'public.can_view_org_financials(uuid)',
    'public.can_read_org_financial_row(uuid, uuid, uuid, uuid)',
    'public.can_read_invoice_id(uuid)',
    'public.can_write_invoice_id(uuid)',
    'public.can_read_quote_id(uuid)',
    'public.can_write_quote_id(uuid)',
    'public.can_read_commercial_document(uuid, text, uuid)',
    'public.is_payroll_admin_for_org(uuid)',
    'public.can_manage_org_payroll(uuid)',
    'public.can_see_org_workforce(uuid)',
    'public.can_read_payslip_row(public.payslips)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Any signed-in user could bump last_activity_at on any client id in any company.
REVOKE ALL ON FUNCTION public.touch_client_last_activity(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_client_last_activity(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
