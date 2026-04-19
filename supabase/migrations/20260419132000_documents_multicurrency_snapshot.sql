-- Multi-currency snapshots for unified documents + payments.
-- Stores point-in-time rates so reporting remains stable even when market rates change later.

alter table public.documents
  add column if not exists base_currency text not null default 'ZAR',
  add column if not exists exchange_rate numeric(18,8) not null default 1;

alter table public.payments
  add column if not exists currency text not null default 'ZAR',
  add column if not exists exchange_rate numeric(18,8) not null default 1;

-- Backfill document snapshots from existing currency and total semantics.
update public.documents
set base_currency = 'ZAR'
where base_currency is null or trim(base_currency) = '';

update public.documents
set exchange_rate = 1
where exchange_rate is null or exchange_rate <= 0;

-- Keep payment rows aligned to tenant default if missing.
update public.payments p
set currency = coalesce(nullif(trim(p.currency), ''), 'ZAR')
where p.currency is null or trim(p.currency) = '';

update public.payments p
set exchange_rate = 1
where p.exchange_rate is null or p.exchange_rate <= 0;

create index if not exists documents_org_currency_idx on public.documents (org_id, currency);
create index if not exists documents_org_base_currency_idx on public.documents (org_id, base_currency);
create index if not exists payments_org_currency_idx on public.payments (org_id, currency);
