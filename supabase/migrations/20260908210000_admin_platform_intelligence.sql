-- Platform Admin intelligence: exclude internal tenants from aggregates,
-- and record product usage events without storing customer PII.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_internal IS
  'Staff or test tenant. Excluded from platform analytics aggregates. Still visible on the Businesses directory with an Internal label.';

CREATE INDEX IF NOT EXISTS idx_organizations_is_internal
  ON public.organizations (is_internal)
  WHERE is_internal = true;

UPDATE public.organizations o
SET is_internal = true
FROM public.profiles p
WHERE p.id = o.owner_id
  AND lower(coalesce(p.role, '')) IN ('admin', 'management', 'sales', 'support')
  AND o.is_internal = false;

CREATE TABLE IF NOT EXISTS public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid,
  actor_id uuid,
  feature text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.platform_events IS
  'Platform product events for Admin analytics. Store ids and feature names only — no customer financials or personal data.';

CREATE INDEX IF NOT EXISTS idx_platform_events_name_occurred
  ON public.platform_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_events_org_occurred
  ON public.platform_events (org_id, occurred_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_events_admin_select ON public.platform_events;
CREATE POLICY platform_events_admin_select
  ON public.platform_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_platform_admin()
    OR public.is_audit_log_viewer()
  );

CREATE OR REPLACE FUNCTION public.record_platform_usage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_org uuid;
  v_feature text;
BEGIN
  v_name := TG_ARGV[0];
  v_feature := TG_ARGV[1];
  v_org := COALESCE(NEW.org_id, NEW.company_id);

  INSERT INTO public.platform_events (event_name, org_id, actor_id, feature, metadata)
  VALUES (
    v_name,
    v_org,
    COALESCE(NEW.user_id, NEW.created_by, NEW.owner_id),
    v_feature,
    jsonb_build_object('source_table', TG_TABLE_NAME)
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_event_invoice_created ON public.invoices;
CREATE TRIGGER trg_platform_event_invoice_created
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage_event('invoice_created', 'invoices');

DROP TRIGGER IF EXISTS trg_platform_event_quote_created ON public.quotes;
CREATE TRIGGER trg_platform_event_quote_created
  AFTER INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage_event('quote_created', 'quotes');

DROP TRIGGER IF EXISTS trg_platform_event_pos_used ON public.pos_sales_events;
CREATE TRIGGER trg_platform_event_pos_used
  AFTER INSERT ON public.pos_sales_events
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage_event('pos_used', 'pos');

DROP TRIGGER IF EXISTS trg_platform_event_payslip_created ON public.payslips;
CREATE TRIGGER trg_platform_event_payslip_created
  AFTER INSERT ON public.payslips
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage_event('payslip_created', 'workforce');

DROP TRIGGER IF EXISTS trg_platform_event_recurring_created ON public.recurring_invoices;
CREATE TRIGGER trg_platform_event_recurring_created
  AFTER INSERT ON public.recurring_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage_event('recurring_created', 'documents');
