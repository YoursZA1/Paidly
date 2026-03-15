-- Expense table structure: ensure vat column exists (id, vendor, amount, vat, category, receipt_url, created_at)
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS vat numeric(12,2);

COMMENT ON COLUMN public.expenses.vat IS 'VAT amount from receipt if shown';
