-- Optional company website for invoices/quotes (DocumentPreview "FROM" block).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_website text;

COMMENT ON COLUMN public.profiles.company_website IS 'Optional URL shown on document preview when set in Settings';
