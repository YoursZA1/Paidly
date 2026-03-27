-- Explicit user_id on invoices/quotes (auth.users), aligned with client inserts using auth.getUser().
-- Safe to re-run.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.invoices SET user_id = created_by WHERE user_id IS NULL AND created_by IS NOT NULL;
UPDATE public.quotes SET user_id = created_by WHERE user_id IS NULL AND created_by IS NOT NULL;
