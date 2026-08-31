-- Optional brand ownership on the existing catalog (public.services).
-- Null company_id = org-shared (visible on every till). Set company_id = private
-- to that brand; Company A's POS must not sell Company B's private products.
-- Do not add a second products table. Same companies.id as invoices.company_id
-- and pos_registers.company_id.

DO $$
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    RAISE EXCEPTION 'services missing — cannot add catalog brand ownership';
  END IF;
END $$;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE NOTICE 'companies missing — skip services.company_id FK';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_company_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.services
      ADD CONSTRAINT services_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
  $c$;
END $$;

CREATE INDEX IF NOT EXISTS idx_services_org_company
  ON public.services (org_id, company_id)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN public.services.company_id IS
  'Brand (public.companies.id). Null = org-shared catalog. Set = private to that brand; POS tills on other brands cannot sell it.';
