-- Plan entitlements enforced at the database for tables the browser writes directly (2026-09-24).
--
-- Inventory, purchase orders, suppliers, expenses, recurring invoices, payslips and catalog products
-- are created by the SPA straight through PostgREST, and stock moves through adjust_inventory_stock.
-- Until now only the browser checked the plan, so a Starter user calling PostgREST directly could
-- create Business-only records. This adds the server-side boundary, plus company email templates.
--
-- Same model as server/src/billing/entitlements.js:
--   company (row org_id/company_id, else the caller's owned company, else membership)
--   → company_access_subscription() → access? → plan family → feature / limit.
-- The feature tiers and limits mirror shared/planFeatures.js; tests/unit/planEntitlementMatrix.test.js
-- fails if this file and the catalog disagree.
--
-- Scope: end-user writes only (auth.uid() set). Service-role writes (server routes, which have their
-- own gates), anonymous public flows and platform admins pass.
--   * BEFORE INSERT on the feature tables. services: products → inventory, other catalog items →
--     invoices (shared/planFeatures.js catalogItemFeature).
--   * adjust_inventory_stock (manual stock moves) → inventory.
--   * organizations.email_templates changes → email_templates.
-- Row UPDATE/DELETE is not guarded: invoice-payment triggers move catalog stock as the user, and a
-- downgraded company must still be able to edit or remove its existing records.
-- Payslip limit: employees who already have payslips are grandfathered; only a NEW employee beyond
-- the limit is refused (shared/planFeatures.js checkPayslipCapacity).
--
-- Switch (same meaning as PAIDLY_ENTITLEMENTS_ENFORCE):
--   ALTER ROLE authenticated SET app.paidly_entitlements_enforce = 'off';  -- log-only (WARNING)
--   ALTER ROLE authenticated RESET app.paidly_entitlements_enforce;        -- enforce (default)

-- ── Catalog mirror (shared/planFeatures.js) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.paidly_family_rank(p_family text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(coalesce(p_family, ''))
    WHEN 'starter' THEN 1
    WHEN 'business' THEN 2
    WHEN 'growth' THEN 3
    WHEN 'enterprise' THEN 4
    ELSE 0
  END;
$$;

-- Lowest package rank that includes the feature; unknown feature → 99 (deny).
CREATE OR REPLACE FUNCTION public.paidly_feature_min_tier(p_feature text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_feature
    -- starter
    WHEN 'invoices' THEN 1 WHEN 'quotes' THEN 1 WHEN 'clients' THEN 1
    WHEN 'reports_basic' THEN 1 WHEN 'basic_reports' THEN 1 WHEN 'email_send' THEN 1
    WHEN 'email' THEN 1 WHEN 'documents_pdf' THEN 1 WHEN 'support_basic' THEN 1
    WHEN 'payslips' THEN 1
    -- business
    WHEN 'inventory' THEN 2 WHEN 'pos' THEN 2 WHEN 'expenses' THEN 2 WHEN 'purchase_orders' THEN 2
    WHEN 'vat_reports' THEN 2 WHEN 'email_templates' THEN 2 WHEN 'templates' THEN 2
    WHEN 'recurring_invoices' THEN 2 WHEN 'payroll' THEN 2 WHEN 'leave_management' THEN 2
    WHEN 'support_priority' THEN 2
    -- growth
    WHEN 'departments' THEN 3 WHEN 'approval_workflows' THEN 3 WHEN 'reports_advanced' THEN 3
    WHEN 'advanced_reports' THEN 3 WHEN 'api_access' THEN 3 WHEN 'integrations' THEN 3
    WHEN 'multi_company' THEN 3
    -- enterprise
    WHEN 'sso' THEN 4 WHEN 'dedicated_support' THEN 4 WHEN 'custom_contract' THEN 4
    WHEN 'white_label' THEN 4
    ELSE 99
  END;
$$;

-- FAMILY_LIMITS.payslipEmployees (NULL = unlimited).
CREATE OR REPLACE FUNCTION public.paidly_payslip_employee_limit(p_family text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(coalesce(p_family, ''))
    WHEN 'starter' THEN 1
    WHEN 'business' THEN 4
    WHEN 'growth' THEN NULL
    WHEN 'enterprise' THEN NULL
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.paidly_family_label(p_family text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE lower(coalesce(p_family, ''))
    WHEN 'starter' THEN 'Starter' WHEN 'business' THEN 'Business'
    WHEN 'growth' THEN 'Growth' WHEN 'enterprise' THEN 'Enterprise'
    ELSE 'current'
  END;
$$;

-- ── Company + plan resolution (server/src/billing/httpAuth.js resolveUserCompanyId) ─────
CREATE OR REPLACE FUNCTION public.paidly_user_company_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(
    (SELECT o.id FROM public.organizations o WHERE o.owner_id = p_user_id ORDER BY o.created_at ASC LIMIT 1),
    (SELECT m.org_id FROM public.memberships m WHERE m.user_id = p_user_id ORDER BY m.created_at ASC LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.paidly_user_company_id(uuid) FROM PUBLIC;

-- Effective plan + access for a company: the access row the server resolver picks.
CREATE OR REPLACE FUNCTION public.paidly_company_plan(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (family text, has_access boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.subscriptions;
BEGIN
  s := public.company_access_subscription(p_company_id, p_user_id);
  IF s.id IS NULL THEN
    RETURN QUERY SELECT NULL::text, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT
    coalesce(
      public.normalize_plan_family(s.plan_slug),
      public.normalize_plan_family(s.plan_family),
      public.normalize_plan_family(s.plan),
      public.normalize_plan_family(s.current_plan)
    ),
    public.subscription_row_has_access(s);
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_company_plan(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paidly_company_plan(uuid, uuid) TO service_role;

-- ── Assert (raises, or warns in report-only mode) ─────────────────────────────────────
-- p_row: the row being written (for the payslip employee identity); '{}' otherwise.
CREATE OR REPLACE FUNCTION public.paidly_assert_plan_feature(p_feature text, p_company uuid, p_row jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_family text;
  v_access boolean;
  v_min int;
  v_upgrade text;
  v_limit int;
  v_key text;
  v_used int;
  v_message text;
  v_code text;
BEGIN
  -- Server (service role), anonymous public flows and platform admins are gated elsewhere.
  IF v_uid IS NULL OR coalesce(public.is_admin(), false) THEN
    RETURN;
  END IF;

  v_company := coalesce(p_company, public.paidly_user_company_id(v_uid));
  SELECT p.family, p.has_access INTO v_family, v_access
  FROM public.paidly_company_plan(v_company, v_uid) p;

  v_min := public.paidly_feature_min_tier(p_feature);

  IF NOT coalesce(v_access, false) THEN
    v_code := 'SUBSCRIPTION_REQUIRED';
    v_message := CASE WHEN v_family IS NULL
      THEN 'Choose a Paidly plan to use this feature.'
      ELSE format('Your %s plan is not active. Renew %s to continue.', public.paidly_family_label(v_family), public.paidly_family_label(v_family))
    END;
  ELSIF public.paidly_family_rank(v_family) < v_min THEN
    v_code := 'PLAN_UPGRADE_REQUIRED';
    v_upgrade := CASE WHEN v_min <= 3 THEN public.paidly_family_label(CASE v_min WHEN 1 THEN 'starter' WHEN 2 THEN 'business' ELSE 'growth' END) END;
    v_message := format(
      'This feature is not included in your %s plan.%s',
      public.paidly_family_label(v_family),
      CASE WHEN v_upgrade IS NOT NULL THEN format(' Upgrade to %s to use it.', v_upgrade) ELSE '' END
    );
  ELSIF p_feature = 'payslips' THEN
    v_limit := public.paidly_payslip_employee_limit(v_family);
    IF v_limit IS NOT NULL THEN
      v_key := coalesce(
        NULLIF(btrim(p_row ->> 'membership_id'), ''),
        lower(NULLIF(btrim(p_row ->> 'employee_id'), '')),
        lower(NULLIF(btrim(p_row ->> 'employee_name'), ''))
      );
      -- Grandfathered: an employee who already has a payslip is never blocked.
      IF v_key IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.payslips ps
        WHERE ps.org_id = v_company
          AND coalesce(ps.membership_id::text, lower(NULLIF(btrim(ps.employee_id), '')), lower(NULLIF(btrim(ps.employee_name), ''))) = v_key
      ) THEN
        SELECT count(DISTINCT coalesce(ps.membership_id::text, lower(NULLIF(btrim(ps.employee_id), '')), lower(NULLIF(btrim(ps.employee_name), ''))))
        INTO v_used
        FROM public.payslips ps
        WHERE ps.org_id = v_company;
        IF v_used + 1 > v_limit THEN
          v_code := 'PAYSLIP_EMPLOYEE_LIMIT';
          v_upgrade := CASE WHEN lower(v_family) = 'starter' AND v_used + 1 <= 4 THEN 'Business' ELSE 'Growth' END;
          v_message := format(
            'Your %s plan includes payslips for %s employee%s. Upgrade to %s to issue payslips for more employees.',
            public.paidly_family_label(v_family), v_limit, CASE WHEN v_limit = 1 THEN '' ELSE 's' END, v_upgrade
          );
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_message IS NULL THEN
    RETURN;
  END IF;

  IF coalesce(current_setting('app.paidly_entitlements_enforce', true), 'on') = 'off' THEN
    RAISE WARNING 'paidly entitlements (report-only) would block %: %', p_feature, v_message;
    RETURN;
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_message, HINT = v_code || ':' || p_feature;
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_assert_plan_feature(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paidly_assert_plan_feature(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.paidly_assert_plan_feature(text, uuid, jsonb) IS
  'Raise unless the company plan includes the feature (and, for payslips, the employee fits the grandfathered limit). Mirrors shared/planFeatures.js. End-user callers only.';

-- ── Table guard ──────────────────────────────────────────────────────────────────────
-- TG_ARGV[0] = feature key, or 'catalog' for services (products → inventory, else invoices).
CREATE OR REPLACE FUNCTION public.paidly_enforce_plan_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_feature text := TG_ARGV[0];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_feature = 'catalog' THEN
    v_feature := CASE WHEN lower(coalesce(v_row ->> 'item_type', 'service')) = 'product' THEN 'inventory' ELSE 'invoices' END;
  END IF;
  PERFORM public.paidly_assert_plan_feature(
    v_feature,
    coalesce(NULLIF(v_row ->> 'org_id', '')::uuid, NULLIF(v_row ->> 'company_id', '')::uuid),
    v_row
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_enforce_plan_feature() FROM PUBLIC;

COMMENT ON FUNCTION public.paidly_enforce_plan_feature() IS
  'BEFORE INSERT guard: company plan must include TG_ARGV[0] (catalog: by item_type). Mirrors shared/planFeatures.js. End-user writes only.';

-- ── Attach (only to tables that exist) ────────────────────────────────────────────────
DO $$
DECLARE
  pair text[];
  pairs text[][] := ARRAY[
    ARRAY['services', 'catalog'],
    ARRAY['products', 'inventory'],
    ARRAY['stock_transactions', 'inventory'],
    ARRAY['purchase_orders', 'purchase_orders'],
    ARRAY['purchase_order_items', 'purchase_orders'],
    ARRAY['suppliers', 'purchase_orders'],
    ARRAY['expenses', 'expenses'],
    ARRAY['recurring_invoices', 'recurring_invoices'],
    ARRAY['payslips', 'payslips']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF to_regclass('public.' || pair[1]) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS paidly_plan_feature_guard ON public.%I', pair[1]);
      EXECUTE format(
        'CREATE TRIGGER paidly_plan_feature_guard BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.paidly_enforce_plan_feature(%L)',
        pair[1], pair[2]
      );
    END IF;
  END LOOP;
END $$;

-- ── Manual stock moves (Inventory page) → inventory ───────────────────────────────────
-- Same signature/body as 20260913140000; only the plan assert is added. POS stock moves come from
-- the server (service role) and pass. Invoice-payment stock triggers call apply_inventory_movement
-- directly, not this RPC, so Starter invoicing is unaffected.
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id uuid,
  p_org_id uuid,
  p_delta numeric,
  p_type text,
  p_source text DEFAULT 'manual',
  p_reference_id uuid DEFAULT NULL
)
RETURNS TABLE(new_stock numeric)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.paidly_assert_plan_feature('inventory', p_org_id, '{}'::jsonb);
  RETURN QUERY SELECT public.apply_inventory_movement(
    p_product_id, p_org_id, p_delta, p_type, p_source, p_reference_id
  );
END;
$$;

-- ── Company email templates (Business+) ───────────────────────────────────────────────
-- Saved default subject/message per document type, used to prefill the send-email dialog.
-- Written through PUT /api/company/email-templates (server gate); this guards direct PostgREST writes.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.email_templates IS
  'Company email templates { invoice: { subject, message }, quote: { subject, message } }. Plan feature email_templates (Business+). shared/emailTemplates.js.';

CREATE OR REPLACE FUNCTION public.paidly_guard_email_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.email_templates IS DISTINCT FROM OLD.email_templates THEN
    PERFORM public.paidly_assert_plan_feature('email_templates', NEW.id, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_guard_email_templates() FROM PUBLIC;

DROP TRIGGER IF EXISTS paidly_email_templates_guard ON public.organizations;
CREATE TRIGGER paidly_email_templates_guard
  BEFORE UPDATE OF email_templates ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.paidly_guard_email_templates();
