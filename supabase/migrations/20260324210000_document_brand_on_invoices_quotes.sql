-- Snapshot document template colours on each invoice/quote for client-facing views (no auth).
-- Apply in Supabase SQL Editor if migrations are not run automatically.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_brand_primary text,
  ADD COLUMN IF NOT EXISTS document_brand_secondary text;

COMMENT ON COLUMN public.invoices.document_brand_primary IS 'Optional #rrggbb at last save/send; used on public invoice/PDF';
COMMENT ON COLUMN public.invoices.document_brand_secondary IS 'Optional #rrggbb at last save/send; used on public invoice/PDF';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS document_brand_primary text,
  ADD COLUMN IF NOT EXISTS document_brand_secondary text;

COMMENT ON COLUMN public.quotes.document_brand_primary IS 'Optional #rrggbb at last save; used on public quote/PDF';
COMMENT ON COLUMN public.quotes.document_brand_secondary IS 'Optional #rrggbb at last save; used on public quote/PDF';
