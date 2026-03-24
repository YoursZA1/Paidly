-- Optional profile columns for Paidly Document template accent colours (hex #rrggbb).
-- Run in Supabase SQL editor or psql if PDF/preview brand colours should persist per user.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS document_brand_primary text,
  ADD COLUMN IF NOT EXISTS document_brand_secondary text;

COMMENT ON COLUMN public.profiles.document_brand_primary IS 'Optional #rrggbb; null = app default (--brand-primary)';
COMMENT ON COLUMN public.profiles.document_brand_secondary IS 'Optional #rrggbb; null = app default (--brand-secondary)';
