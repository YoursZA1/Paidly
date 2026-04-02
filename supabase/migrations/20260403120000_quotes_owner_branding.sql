-- Snapshot owner / letterhead fields on quotes (parity with invoices) for PDFs and document-only logos.
-- Safe to re-run.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS owner_company_name text,
  ADD COLUMN IF NOT EXISTS owner_company_address text,
  ADD COLUMN IF NOT EXISTS owner_logo_url text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_currency text;

COMMENT ON COLUMN public.quotes.owner_logo_url IS 'Optional logo for this quote only; overrides profile logo in PDF/preview.';
