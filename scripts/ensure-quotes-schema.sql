-- Ensure quotes and quote_items tables exist (fix "Could not find the table 'public.quotes' in the schema cache")
-- Run this entire file in Supabase SQL Editor.
-- If you get errors about "organizations", "clients", or "is_admin", run supabase/schema.postgres.sql first.

create extension if not exists "uuid-ossp";

-- Ensure is_admin() exists (used by RLS policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

-- Create quotes table if it does not exist (matches supabase/schema.postgres.sql)
create table if not exists public.quotes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  quote_number text,
  status text not null default 'draft',
  project_title text,
  project_description text,
  valid_until date,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text default 'USD',
  notes text,
  terms_conditions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add quote_number if missing (for existing tables created before this column existed)
alter table public.quotes add column if not exists quote_number text;

-- Add currency column if missing (for existing tables created before this column existed)
alter table public.quotes add column if not exists currency text default 'USD';

-- Create quote_items table if it does not exist
create table if not exists public.quote_items (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_name text,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0
);

-- Enable RLS
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- Drop and recreate policies (safe to run multiple times)
drop policy if exists "admin full access quotes" on public.quotes;
create policy "admin full access quotes" on public.quotes
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select quotes" on public.quotes;
create policy "org members select quotes" on public.quotes
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write quotes" on public.quotes;
create policy "org members write quotes" on public.quotes
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "admin full access quote items" on public.quote_items;
create policy "admin full access quote items" on public.quote_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select quote items" on public.quote_items;
create policy "org members select quote items" on public.quote_items
  for select
  using (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write quote items" on public.quote_items;
create policy "org members write quote items" on public.quote_items
  for all
  using (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ));

-- Optional: indexes for performance (no-op if already exist)
create index if not exists idx_quotes_org_id on public.quotes(org_id);
create index if not exists idx_quotes_client_id on public.quotes(client_id);
create index if not exists idx_quotes_quote_number on public.quotes(quote_number);
create index if not exists idx_quotes_status on public.quotes(status);
create index if not exists idx_quotes_created_at on public.quotes(created_at desc);
