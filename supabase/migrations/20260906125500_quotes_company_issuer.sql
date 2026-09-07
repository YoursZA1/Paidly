-- Unify invoice + quote issuer: quotes.company_id and server-side org validation.
-- Commercial documents only. POS till branding is unchanged.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_company_id_fkey'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON public.quotes (company_id);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS owner_vat_number text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS owner_vat_number text;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.quotes.company_id IS
  'Trading brand (public.companies). Same issuer model as invoices.company_id. Not POS till branding.';

CREATE OR REPLACE FUNCTION public.resolve_org_company_id(p_org_id uuid, p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.id = p_company_id
    AND c.org_id = p_org_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_org_company_id(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_org_company_id(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.resolve_org_company_id(uuid, uuid) IS
  'Returns company_id only when that companies row belongs to the org. Rejects spoofed browser company_id.';

CREATE OR REPLACE FUNCTION public.enforce_commercial_document_issuer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
BEGIN
  NEW.company_id := public.resolve_org_company_id(NEW.org_id, NEW.company_id);

  IF TG_TABLE_NAME = 'invoices'
     AND NEW.source_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote
    FROM public.quotes
    WHERE id = NEW.source_quote_id
      AND org_id = NEW.org_id;

    IF FOUND THEN
      NEW.company_id := COALESCE(NEW.company_id, public.resolve_org_company_id(NEW.org_id, v_quote.company_id));
      NEW.owner_company_name := COALESCE(NULLIF(btrim(NEW.owner_company_name), ''), v_quote.owner_company_name);
      NEW.owner_company_address := COALESCE(NULLIF(btrim(NEW.owner_company_address), ''), v_quote.owner_company_address);
      NEW.owner_logo_url := COALESCE(NULLIF(btrim(NEW.owner_logo_url), ''), v_quote.owner_logo_url);
      NEW.owner_email := COALESCE(NULLIF(btrim(NEW.owner_email), ''), v_quote.owner_email);
      NEW.owner_phone := COALESCE(NULLIF(btrim(NEW.owner_phone), ''), v_quote.owner_phone);
      NEW.owner_vat_number := COALESCE(NULLIF(btrim(NEW.owner_vat_number), ''), v_quote.owner_vat_number);
      NEW.owner_currency := COALESCE(NULLIF(btrim(NEW.owner_currency), ''), v_quote.owner_currency);
      NEW.banking_detail_id := COALESCE(NEW.banking_detail_id, v_quote.banking_detail_id);
      NEW.document_brand_primary := COALESCE(NEW.document_brand_primary, v_quote.document_brand_primary);
      NEW.document_brand_secondary := COALESCE(NEW.document_brand_secondary, v_quote.document_brand_secondary);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_commercial_issuer ON public.invoices;
CREATE TRIGGER trg_invoices_commercial_issuer
  BEFORE INSERT OR UPDATE OF company_id, source_quote_id, org_id ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_commercial_document_issuer();

DROP TRIGGER IF EXISTS trg_quotes_commercial_issuer ON public.quotes;
CREATE TRIGGER trg_quotes_commercial_issuer
  BEFORE INSERT OR UPDATE OF company_id, org_id ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_commercial_document_issuer();
