-- enforce_commercial_document_issuer() runs BEFORE INSERT/UPDATE on BOTH invoices and quotes
-- (20260906125500_quotes_company_issuer.sql). It read NEW.source_quote_id behind
-- `IF TG_TABLE_NAME = 'invoices' AND NEW.source_quote_id IS NOT NULL`. PL/pgSQL plans that whole
-- expression before evaluating it, and quotes has no source_quote_id column, so every INSERT into quotes
-- (and every UPDATE of quotes.company_id / org_id) raised: record "new" has no field "source_quote_id".
--
-- Fix: branch on the table first. PL/pgSQL plans each statement lazily, on first execution, per trigger
-- relation, so invoice-only field access inside the invoices branch is never planned for quotes.
-- Behaviour for invoices is unchanged. CREATE OR REPLACE keeps the existing grants and both triggers.

CREATE OR REPLACE FUNCTION public.enforce_commercial_document_issuer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
BEGIN
  NEW.company_id := public.resolve_org_company_id(NEW.org_id, NEW.company_id);

  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.source_quote_id IS NOT NULL THEN
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
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
