-- Run in Supabase → SQL Editor if invoices/quotes lack document brand snapshot columns.
-- Same as supabase/migrations/20260324210000_document_brand_on_invoices_quotes.sql

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_brand_primary text,
  ADD COLUMN IF NOT EXISTS document_brand_secondary text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS document_brand_primary text,
  ADD COLUMN IF NOT EXISTS document_brand_secondary text;
