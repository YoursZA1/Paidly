-- Align payslips with invoices/quotes: explicit auth user (creator) for analytics and dashboards.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

UPDATE public.payslips
SET user_id = created_by_id
WHERE user_id IS NULL AND created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payslips_user_id_idx ON public.payslips (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON public.invoices (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_user_id_idx ON public.quotes (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.payslips.user_id IS 'Auth user who created the payslip (reporting / per-user totals).';
