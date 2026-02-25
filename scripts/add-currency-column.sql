-- ============================================
-- ADD CURRENCY COLUMN TO INVOICES AND QUOTES
-- ============================================
-- Run this script in Supabase SQL Editor to add the currency column
-- to existing invoices and quotes tables.
-- Safe to run multiple times (uses IF NOT EXISTS).

-- Add currency column to invoices table
alter table public.invoices add column if not exists currency text default 'USD';

-- Add currency column to quotes table
alter table public.quotes add column if not exists currency text default 'USD';

-- Update existing invoices to use USD if currency is null (safety check)
update public.invoices 
set currency = 'USD' 
where currency is null;

-- Update existing quotes to use USD if currency is null (safety check)
update public.quotes 
set currency = 'USD' 
where currency is null;

-- Reload PostgREST schema cache so the API sees the new column
notify pgrst, 'reload schema';

-- Verify the columns were added
select 
  table_name,
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('invoices', 'quotes')
  and column_name = 'currency'
order by table_name;

-- Expected: Should see 2 rows (one for invoices, one for quotes)
