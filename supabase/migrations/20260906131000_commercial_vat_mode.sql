-- Phase 09: persist VAT inclusive / exclusive mode.
-- Historical rows default to VAT_EXCLUSIVE. Totals are not rewritten.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'VAT_EXCLUSIVE';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'VAT_EXCLUSIVE';

UPDATE public.invoices
SET vat_mode = 'VAT_EXCLUSIVE'
WHERE vat_mode IS NULL
   OR vat_mode NOT IN ('VAT_INCLUSIVE', 'VAT_EXCLUSIVE');

UPDATE public.quotes
SET vat_mode = 'VAT_EXCLUSIVE'
WHERE vat_mode IS NULL
   OR vat_mode NOT IN ('VAT_INCLUSIVE', 'VAT_EXCLUSIVE');

ALTER TABLE public.invoices
  ALTER COLUMN vat_mode SET DEFAULT 'VAT_EXCLUSIVE';
ALTER TABLE public.invoices
  ALTER COLUMN vat_mode SET NOT NULL;
ALTER TABLE public.quotes
  ALTER COLUMN vat_mode SET DEFAULT 'VAT_EXCLUSIVE';
ALTER TABLE public.quotes
  ALTER COLUMN vat_mode SET NOT NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_vat_mode_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_vat_mode_check
  CHECK (vat_mode IN ('VAT_INCLUSIVE', 'VAT_EXCLUSIVE'));

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_vat_mode_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_vat_mode_check
  CHECK (vat_mode IN ('VAT_INCLUSIVE', 'VAT_EXCLUSIVE'));

COMMENT ON COLUMN public.invoices.vat_mode IS
  'VAT_EXCLUSIVE: unit prices are net, VAT is added. VAT_INCLUSIVE: unit prices are gross, VAT is extracted. Historical rows default exclusive; totals are not migrated.';
COMMENT ON COLUMN public.quotes.vat_mode IS
  'VAT_EXCLUSIVE or VAT_INCLUSIVE. Copied onto the invoice at quote conversion.';

-- Conversion copies the quote VAT mode onto the new invoice.
CREATE OR REPLACE FUNCTION public.copy_quote_vat_mode_on_invoice_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  quote_mode text;
BEGIN
  IF NEW.source_quote_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT q.vat_mode INTO quote_mode
  FROM public.quotes q
  WHERE q.id = NEW.source_quote_id;
  IF quote_mode IN ('VAT_INCLUSIVE', 'VAT_EXCLUSIVE') THEN
    NEW.vat_mode := quote_mode;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_copy_quote_vat_mode_on_invoice_insert ON public.invoices;
CREATE TRIGGER trg_copy_quote_vat_mode_on_invoice_insert
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.copy_quote_vat_mode_on_invoice_insert();
