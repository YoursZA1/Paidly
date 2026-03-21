-- Default bank details for PDFs / invoices when no banking_detail_id is set on the invoice.
-- Run in Supabase SQL editor or via migration.

alter table public.profiles
  add column if not exists business jsonb;

comment on column public.profiles.business is
  'Optional per-user default bank block: bank_name, account_name, account_number, branch_code (and optional swift_code).';
