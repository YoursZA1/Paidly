-- After a trial or subscription lapses, the company can view existing rows but cannot change them.
--
-- 20260924120000 and 20260924160000 attached paidly_plan_feature_guard as BEFORE INSERT only, so a
-- lapsed company could still edit, delete, or record payments. This replaces those triggers with
-- BEFORE INSERT OR UPDATE OR DELETE:
--   * INSERT still runs the full plan-feature assert (tier + payslip limit).
--   * UPDATE and DELETE run an access-only assert. A live plan can still edit records that a
--     downgrade no longer includes. No access (trial ended, expired, suspended, cancelled past the
--     period, failed) cannot change them.
--   * Service role, anonymous public flows, and platform admins (auth.uid() null or is_admin()) pass.
--     Webhooks and an admin extending trial_ends_at are unaffected. A future trial_ends_at, or an
--     indefinite admin trial (no end date), makes subscription_row_has_access true again.
--
-- Idempotent. Skips tables that do not exist. Does not touch invoice_views (opening a document).

CREATE OR REPLACE FUNCTION public.paidly_assert_subscription_access(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_access boolean;
  v_message text;
BEGIN
  IF v_uid IS NULL OR coalesce(public.is_admin(), false) THEN
    RETURN;
  END IF;

  v_company := coalesce(p_company, public.paidly_user_company_id(v_uid));
  SELECT p.has_access INTO v_access
  FROM public.paidly_company_plan(v_company, v_uid) p;

  IF coalesce(v_access, false) THEN
    RETURN;
  END IF;

  v_message := 'Your trial has ended. You can view your data until you subscribe.';

  IF coalesce(current_setting('app.paidly_entitlements_enforce', true), 'on') = 'off' THEN
    RAISE WARNING 'paidly entitlements (report-only) would block a write: %', v_message;
    RETURN;
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_message, HINT = 'SUBSCRIPTION_REQUIRED:view_only';
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_assert_subscription_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paidly_assert_subscription_access(uuid) TO authenticated;

COMMENT ON FUNCTION public.paidly_assert_subscription_access(uuid) IS
  'Raise when the company subscription does not grant access. End-user UPDATE/DELETE only. Admin trial extension restores access.';

CREATE OR REPLACE FUNCTION public.paidly_enforce_plan_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb;
  v_feature text := TG_ARGV[0];
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  IF TG_OP = 'INSERT' THEN
    IF v_feature = 'catalog' THEN
      v_feature := CASE WHEN lower(coalesce(v_row ->> 'item_type', 'service')) = 'product' THEN 'inventory' ELSE 'invoices' END;
    END IF;
    PERFORM public.paidly_assert_plan_feature(
      v_feature,
      coalesce(NULLIF(v_row ->> 'org_id', '')::uuid, NULLIF(v_row ->> 'company_id', '')::uuid),
      v_row
    );
  ELSE
    PERFORM public.paidly_assert_subscription_access(
      coalesce(NULLIF(v_row ->> 'org_id', '')::uuid, NULLIF(v_row ->> 'company_id', '')::uuid)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.paidly_enforce_plan_feature() IS
  'BEFORE INSERT OR UPDATE OR DELETE. INSERT checks the plan feature. UPDATE/DELETE require an active subscription or trial. End-user writes only.';

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
    ARRAY['payslips', 'payslips'],
    ARRAY['invoices', 'invoices'],
    ARRAY['quotes', 'quotes'],
    ARRAY['clients', 'clients'],
    ARRAY['invoice_items', 'invoices'],
    ARRAY['quote_items', 'quotes'],
    ARRAY['payments', 'invoices'],
    ARRAY['banking_details', 'invoices'],
    ARRAY['tasks', 'invoices'],
    ARRAY['notes', 'invoices'],
    ARRAY['document_sends', 'invoices']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF to_regclass('public.' || pair[1]) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS paidly_plan_feature_guard ON public.%I', pair[1]);
      EXECUTE format(
        'CREATE TRIGGER paidly_plan_feature_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.paidly_enforce_plan_feature(%L)',
        pair[1], pair[2]
      );
    END IF;
  END LOOP;
END $$;
