-- Tenant business model: POS is optional. Service orgs stay on invoices/quotes/clients.
-- retail = Paidly + till; mixed = invoices + till. NULL = service (do not force POS).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_type text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_business_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_type_check
  CHECK (
    business_type IS NULL
    OR business_type IN ('service', 'retail', 'mixed')
  );

COMMENT ON COLUMN public.organizations.business_type IS
  'How the tenant sells: service (documents only), retail (POS), mixed (documents + POS). NULL is treated as service — POS stays off.';

-- Keep the till for orgs that already run POS (registers or sales).
DO $$
BEGIN
  IF to_regclass('public.pos_registers') IS NOT NULL THEN
    EXECUTE $u$
      UPDATE public.organizations o
      SET business_type = 'mixed'
      WHERE o.business_type IS NULL
        AND EXISTS (SELECT 1 FROM public.pos_registers r WHERE r.org_id = o.id)
    $u$;
  END IF;
  IF to_regclass('public.pos_sales_events') IS NOT NULL THEN
    EXECUTE $u$
      UPDATE public.organizations o
      SET business_type = 'mixed'
      WHERE o.business_type IS NULL
        AND EXISTS (SELECT 1 FROM public.pos_sales_events s WHERE s.org_id = o.id)
    $u$;
  END IF;
END $$;
